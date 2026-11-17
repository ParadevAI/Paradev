import { ownedByGroup } from "@superset/chats-core";
import { db } from "@superset/db/client";
import {
	chatsAgents,
	chatsGroupAgents,
	chatsGroups,
	chatsMessages,
} from "@superset/db/schema";
import { waitUntil } from "@vercel/functions";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { chatForDev, enqueueTurn, type TurnDeps } from "./engine";
import {
	loadRoster,
	mentionableDevs,
	type RosterDev,
	resolveMentions,
} from "./roster";

/** How far back a Dev's message keeps the conversation going: messages, and minutes. */
const LOOKBACK_MESSAGES = 4;
const LOOKBACK_MS = 10 * 60_000;

/**
 * The Dev a group is talking with, if any: the group's own Dev or one added to
 * it, when it wrote one of the few messages before this one, a moment ago. An
 * unmentioned message then reaches it as a follow-up.
 */
export async function followUpDev(messageId: string): Promise<string | null> {
	const [message] = await db
		.select({
			groupId: chatsMessages.groupId,
			createdAt: chatsMessages.createdAt,
		})
		.from(chatsMessages)
		.where(eq(chatsMessages.id, messageId));
	if (!message) return null;
	const before = await db
		.select({
			agentId: chatsMessages.authorAgentId,
			kind: chatsAgents.kind,
			createdAt: chatsMessages.createdAt,
		})
		.from(chatsMessages)
		.leftJoin(chatsAgents, eq(chatsAgents.id, chatsMessages.authorAgentId))
		.where(
			and(
				eq(chatsMessages.groupId, message.groupId),
				lt(chatsMessages.createdAt, message.createdAt),
			),
		)
		.orderBy(desc(chatsMessages.createdAt))
		.limit(LOOKBACK_MESSAGES);
	const last = before.find(
		(row) => row.kind && ownedByGroup({ kind: row.kind }),
	);
	if (
		!last?.agentId ||
		message.createdAt.getTime() - last.createdAt.getTime() > LOOKBACK_MS
	) {
		return null;
	}
	const [link] = await db
		.select({ id: chatsGroupAgents.agentId })
		.from(chatsGroupAgents)
		.where(
			and(
				eq(chatsGroupAgents.groupId, message.groupId),
				eq(chatsGroupAgents.agentId, last.agentId),
			),
		);
	return link ? last.agentId : null;
}

/** After a Dev speaks up unasked, the group gets a break from unasked replies. */
const COOLDOWN_MS = 2 * 60_000;
/** How many earlier messages the speak-up check is shown. */
const SPEAK_UP_RECENT = 6;

/**
 * Whether one of the group's own Devs should answer a message nobody
 * addressed. Quiet by default: the check must pick a Dev, and the group must
 * not have heard an unasked reply in the last two minutes. The claim is one
 * conditional update, so two messages cannot both win.
 */
async function speakUp(
	deps: TurnDeps,
	check: NonNullable<TurnDeps["speakUp"]>,
	message: { id: string; groupId: string },
	mentionable: RosterDev[],
): Promise<string | null> {
	const now = deps.now?.() ?? new Date();
	const free = and(
		eq(chatsGroups.id, message.groupId),
		or(
			isNull(chatsGroups.jevSpokeAt),
			lt(chatsGroups.jevSpokeAt, new Date(now.getTime() - COOLDOWN_MS)),
		),
	);
	const [group] = await db
		.select({ title: chatsGroups.title })
		.from(chatsGroups)
		.where(free);
	if (!group) return null;
	const { messages } = await chatForDev(message.groupId, SPEAK_UP_RECENT + 1);
	const latest = messages.find((entry) => entry.id === message.id);
	if (!latest) return null;
	const described = await db
		.select({ id: chatsAgents.id, description: chatsAgents.description })
		.from(chatsAgents)
		.where(
			inArray(
				chatsAgents.id,
				mentionable.map((dev) => dev.id),
			),
		);
	const picked = await check({
		group: group.title,
		sender: latest.author,
		text: latest.text,
		recent: messages
			.filter((entry) => entry.id !== message.id)
			.map((entry) => ({ author: entry.author, text: entry.text })),
		devs: mentionable.map((dev) => ({
			id: dev.id,
			name: dev.name,
			description:
				described.find((row) => row.id === dev.id)?.description ?? "",
		})),
	});
	if (!picked || !mentionable.some((dev) => dev.id === picked)) return null;
	const claimed = await db
		.update(chatsGroups)
		.set({ jevSpokeAt: now })
		.where(free)
		.returning({ id: chatsGroups.id });
	return claimed.length > 0 ? picked : null;
}

/**
 * Starts turns for the Devs that should answer a person's message, right
 * after it is stored. In a 1:1 its Dev always answers. In a group, its own
 * Dev answers when mentioned; a mention of a member's Dev counts as no
 * mention. An ambiguous `@Name` wakes nobody and is returned so the sender's
 * app can ask them to pick. With nothing mentioned, a Dev that spoke a moment
 * ago takes it as a follow-up.
 */
export async function triggerTurns(
	deps: TurnDeps,
	message: { id: string; groupId: string; text: string },
): Promise<{ ambiguousMentions: string[] }> {
	const [[group], roster] = await Promise.all([
		db
			.select({ kind: chatsGroups.kind })
			.from(chatsGroups)
			.where(eq(chatsGroups.id, message.groupId)),
		loadRoster(message.groupId),
	]);
	if (!group || roster.length === 0) return { ambiguousMentions: [] };
	const wake = (ids: string[]) =>
		Promise.all(
			ids.map((agentId) =>
				enqueueTurn(deps, {
					agentId,
					groupId: message.groupId,
					messageId: message.id,
				}),
			),
		);
	if (group.kind === "direct") {
		await wake(roster.map((dev) => dev.id));
		return { ambiguousMentions: [] };
	}
	const mentionable = mentionableDevs(roster);
	if (mentionable.length === 0) return { ambiguousMentions: [] };
	const mentions = resolveMentions(message.text, mentionable);
	await wake(mentions.ids);
	if (mentions.ids.length > 0 || mentions.ambiguous.length > 0) {
		return { ambiguousMentions: mentions.ambiguous };
	}
	const followUp = await followUpDev(message.id);
	if (followUp) await wake([followUp]);
	else if (deps.speakUp) {
		waitUntil(
			speakUp(deps, deps.speakUp, message, mentionable)
				.then((picked) => (picked ? wake([picked]) : undefined))
				.catch((error: unknown) =>
					console.error("[chats] the speak-up check failed:", error),
				),
		);
	}
	return { ambiguousMentions: [] };
}
