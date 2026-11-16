import { ownedByGroup } from "@superset/chats-core";
import { db } from "@superset/db/client";
import {
	chatsAgents,
	chatsGroupAgents,
	chatsGroups,
	chatsMessages,
} from "@superset/db/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { enqueueTurn, type TurnDeps } from "./engine";
import { loadRoster, mentionableDevs, resolveMentions } from "./roster";

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
	return { ambiguousMentions: [] };
}
