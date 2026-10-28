import { startTurn, steerTurn } from "@superset/agent-harness/session";
import { db, dbWs } from "@superset/db/client";
import {
	agentSessions,
	agents,
	agentTurns,
	channelMembers,
	channelMessages,
	channels,
	channelThreadFollows,
	type SelectAgent,
	users,
} from "@superset/db/schema";
import { waitUntil } from "@vercel/functions";
import { and, arrayOverlaps, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { agentTemporal } from "../../lib/agent-runtime";
import { agentNotFound } from "./access";
import { announceAgentChanged } from "./agents-changed";

type TurnReason = (typeof agentTurns.$inferInsert)["reason"];

export type TurnOutcome =
	| { turnId: string; outcome: "started" }
	| { turnId: string; outcome: "joined"; steerSeq: number }
	| { turnId: string; outcome: "duplicate"; running: boolean };

interface Prompt {
	agent: { id: string; organizationId: string };
	sessionId: string;
	/** Null for events no person sent, such as a task's report. */
	actingUserId: string | null;
	promptId: string;
	text: string;
	reason: TurnReason;
	triggerMessageId?: string;
}

/**
 * Records a prompt as a turn and hands it to the session's workflow: it
 * starts a turn, or joins the running one as a steer. A prompt id already
 * seen records nothing new. A prompt the workflow never got is undone, so
 * the same prompt id can be sent again.
 */
export async function submitPrompt(prompt: Prompt): Promise<TurnOutcome> {
	const turn = await recordTurn(prompt);
	try {
		await deliver(prompt.sessionId, turn, prompt);
	} catch (error) {
		await forgetUndelivered(turn, prompt.promptId);
		throw error;
	}
	if (turn.outcome === "started") announceAgentChanged(prompt.agent);
	return turn;
}

/** Retries when the running turn settles between the insert and the join. */
async function recordTurn(prompt: Prompt): Promise<TurnOutcome> {
	const { agent, sessionId, promptId } = prompt;
	for (let attempt = 0; attempt < 3; attempt++) {
		const [duplicate] = await db
			.select({ id: agentTurns.id, status: agentTurns.status })
			.from(agentTurns)
			.where(
				and(
					eq(agentTurns.sessionId, sessionId),
					or(
						eq(agentTurns.promptId, promptId),
						sql`${promptId} = any(${agentTurns.steerPromptIds})`,
					),
				),
			)
			.limit(1);
		if (duplicate) {
			return {
				turnId: duplicate.id,
				outcome: "duplicate",
				running: duplicate.status === "running",
			};
		}
		const [started] = await db
			.insert(agentTurns)
			.values({
				organizationId: agent.organizationId,
				agentId: agent.id,
				sessionId,
				reason: prompt.reason,
				actingUserId: prompt.actingUserId,
				promptId,
				triggerMessageId: prompt.triggerMessageId ?? null,
			})
			.onConflictDoNothing()
			.returning({ id: agentTurns.id });
		if (started) return { turnId: started.id, outcome: "started" };
		const [joined] = await db
			.update(agentTurns)
			.set({
				steerPromptIds: sql`array_append(${agentTurns.steerPromptIds}, ${promptId})`,
			})
			.where(
				and(
					eq(agentTurns.sessionId, sessionId),
					eq(agentTurns.status, "running"),
					sql`not (${promptId} = any(${agentTurns.steerPromptIds}))`,
				),
			)
			.returning({
				id: agentTurns.id,
				steers: sql<number>`cardinality(${agentTurns.steerPromptIds})`,
			});
		if (joined) {
			return { turnId: joined.id, outcome: "joined", steerSeq: joined.steers };
		}
	}
	throw agentNotFound();
}

/**
 * A resent prompt for a turn still running goes again, since the first send
 * may not have landed; the workflow drops prompt ids it has seen.
 */
async function deliver(sessionId: string, turn: TurnOutcome, prompt: Prompt) {
	if (turn.outcome === "duplicate" && !turn.running) return;
	const temporal = await agentTemporal();
	const { promptId, text, actingUserId } = prompt;
	if (turn.outcome === "started") {
		await startTurn(temporal, sessionId, {
			turnId: turn.turnId,
			promptId,
			text,
			...(actingUserId ? { actingUserId } : {}),
		});
		return;
	}
	await steerTurn(temporal, sessionId, {
		turnId: turn.turnId,
		promptId,
		text,
	});
}

/** A new turn is removed; a steer is taken off its turn so settling does not wait for it. */
async function forgetUndelivered(turn: TurnOutcome, promptId: string) {
	if (turn.outcome === "started") {
		await db
			.delete(agentTurns)
			.where(
				and(eq(agentTurns.id, turn.turnId), eq(agentTurns.status, "running")),
			);
	} else if (turn.outcome === "joined") {
		await db
			.update(agentTurns)
			.set({
				steerPromptIds: sql`array_remove(${agentTurns.steerPromptIds}, ${promptId})`,
			})
			.where(eq(agentTurns.id, turn.turnId));
	}
}

/** Where a Dev's answer to an event goes: a channel, optionally a thread in it. */
export function replyTarget(channelId: string, threadRootId?: string | null) {
	return threadRootId
		? `channel:${channelId}/thread:${threadRootId}`
		: `channel:${channelId}`;
}

/**
 * What the main session reads: the message with who sent it, where, and
 * where a reply goes, since every source shares one session.
 */
export function eventText(event: {
	from: string;
	where: string;
	replyTo: string | null;
	body: string;
}) {
	const attrs = [
		`from="${attr(event.from)}"`,
		`where="${attr(event.where)}"`,
		...(event.replyTo ? [`reply_to="${event.replyTo}"`] : []),
	];
	return `<message ${attrs.join(" ")}>\n${event.body}\n</message>`;
}

function attr(value: string) {
	return value.replace(/["\n]/g, " ");
}

/** The one session every message to a Dev reaches; made on first use. */
export async function ensureMainSession(agent: {
	id: string;
	organizationId: string;
}): Promise<string> {
	return dbWs.transaction(async (tx) => {
		const [row] = await tx
			.select({ mainSessionId: agents.mainSessionId })
			.from(agents)
			.where(eq(agents.id, agent.id))
			.for("update")
			.limit(1);
		if (!row) throw agentNotFound();
		if (row.mainSessionId) return row.mainSessionId;
		const [session] = await tx
			.insert(agentSessions)
			.values({
				organizationId: agent.organizationId,
				agentId: agent.id,
				kind: "main",
			})
			.returning({ id: agentSessions.id });
		if (!session) throw new Error("main session insert returned no row");
		await tx
			.update(agents)
			.set({ mainSessionId: session.id })
			.where(eq(agents.id, agent.id));
		return session.id;
	});
}

export interface ChannelRouterInput {
	channel: { id: string; name: string };
	message: { id: string; body: string; authorName: string };
	devs: Array<{ id: string; name: string; description: string | null }>;
}

/** Which of a channel's Devs an unmentioned message is for; none by default. */
export type ChannelRouter = (input: ChannelRouterInput) => Promise<string[]>;

const routeNobody: ChannelRouter = async () => [];

/**
 * Hands a person's message to the Devs it is for, each in its main session:
 * the Dev of a DM; Devs mentioned in a channel; Devs already in the thread
 * it replies to; and, for other channel messages, the Devs the channel
 * router picks. The Dev answers in the message's thread.
 */
export async function startTurnsForMessage(
	channel: { id: string; kind: "channel" | "dm" },
	message: {
		id: string;
		body: string;
		threadRootId: string | null;
		mentionedIds: string[];
	},
	userId: string,
	router: ChannelRouter = routeNobody,
) {
	const [room] = await db
		.select({ name: channels.name })
		.from(channels)
		.where(eq(channels.id, channel.id))
		.limit(1);
	const [author] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const members = await db
		.select({ agent: agents })
		.from(channelMembers)
		.innerJoin(agents, eq(agents.id, channelMembers.actorId))
		.where(
			and(
				eq(channelMembers.channelId, channel.id),
				isNull(agents.archivedAt),
				isNull(agents.pausedAt),
			),
		);
	const devs = members.map((row) => row.agent);
	const work = new Map<string, { agent: SelectAgent; reason: TurnReason }>();
	if (channel.kind === "dm") {
		for (const agent of devs)
			work.set(agent.id, { agent, reason: "direct_message" });
	} else {
		for (const agent of devs) {
			if (message.mentionedIds.includes(agent.id)) {
				work.set(agent.id, { agent, reason: "mention" });
			}
		}
		if (message.threadRootId) {
			const inThread = await devsInThread(
				message.threadRootId,
				devs.map((agent) => agent.id),
			);
			for (const agent of devs) {
				if (inThread.has(agent.id) && !work.has(agent.id)) {
					work.set(agent.id, { agent, reason: "thread_reply" });
				}
			}
		}
		const unasked = devs.filter((agent) => !work.has(agent.id));
		if (work.size === 0 && unasked.length > 0) {
			// Classifying waits on a model; the sender's request should not.
			waitUntil(
				routeUnmentioned({
					router,
					channel: { id: channel.id, name: room?.name ?? "channel" },
					message,
					authorName: author?.name ?? "someone",
					unasked,
					userId,
				}),
			);
			return;
		}
	}
	await deliverToMains({
		work: [...work.values()],
		text: messageEvent({
			channel,
			roomName: room?.name,
			authorName: author?.name,
			message,
		}),
		message,
		userId,
	});
}

async function routeUnmentioned({
	router,
	channel,
	message,
	authorName,
	unasked,
	userId,
}: {
	router: ChannelRouter;
	channel: { id: string; name: string };
	message: { id: string; body: string; threadRootId: string | null };
	authorName: string;
	unasked: SelectAgent[];
	userId: string;
}) {
	const picked = await router({
		channel,
		message: { id: message.id, body: message.body, authorName },
		devs: unasked.map(({ id, name, description }) => ({
			id,
			name,
			description,
		})),
	}).catch((error: unknown) => {
		console.error("[agent-turns] channel router failed", error);
		return [] as string[];
	});
	const work = unasked
		.filter((agent) => picked.includes(agent.id))
		.map((agent) => ({ agent, reason: "channel_message" as const }));
	await deliverToMains({
		work,
		text: messageEvent({
			channel: { id: channel.id, kind: "channel" },
			roomName: channel.name,
			authorName,
			message,
		}),
		message,
		userId,
	});
}

function messageEvent({
	channel,
	roomName,
	authorName,
	message,
}: {
	channel: { id: string; kind: "channel" | "dm" };
	roomName: string | undefined;
	authorName: string | undefined;
	message: { id: string; body: string; threadRootId: string | null };
}) {
	const threadRootId =
		channel.kind === "dm"
			? message.threadRootId
			: (message.threadRootId ?? message.id);
	return eventText({
		from: authorName ?? "someone",
		where:
			channel.kind === "dm"
				? "your DM"
				: `#${roomName ?? "channel"}${message.threadRootId ? ", in a thread" : ""}`,
		replyTo: replyTarget(channel.id, threadRootId),
		body: message.body,
	});
}

async function deliverToMains({
	work,
	text,
	message,
	userId,
}: {
	work: Array<{ agent: SelectAgent; reason: TurnReason }>;
	text: string;
	message: { id: string };
	userId: string;
}) {
	const results = await Promise.allSettled(
		work.map(async ({ agent, reason }) =>
			submitPrompt({
				agent,
				sessionId: await ensureMainSession(agent),
				actingUserId: userId,
				promptId: message.id,
				text,
				reason,
				triggerMessageId: message.id,
			}),
		),
	);
	for (const result of results) {
		if (result.status === "rejected") {
			console.error("[agent-turns] couldn't start a turn", result.reason);
		}
	}
}

/** Devs that follow a thread, have written in it, or were mentioned in it. */
async function devsInThread(
	threadRootId: string,
	devIds: string[],
): Promise<Set<string>> {
	if (devIds.length === 0) return new Set();
	const [followers, writers] = await Promise.all([
		db
			.select({ id: channelThreadFollows.actorId })
			.from(channelThreadFollows)
			.where(
				and(
					eq(channelThreadFollows.rootId, threadRootId),
					eq(channelThreadFollows.following, true),
					inArray(channelThreadFollows.actorId, devIds),
				),
			),
		db
			.select({
				authorId: channelMessages.authorId,
				mentionedIds: channelMessages.mentionedIds,
			})
			.from(channelMessages)
			.where(
				and(
					or(
						eq(channelMessages.threadRootId, threadRootId),
						eq(channelMessages.id, threadRootId),
					),
					or(
						inArray(channelMessages.authorId, devIds),
						arrayOverlaps(channelMessages.mentionedIds, devIds),
					),
				),
			),
	]);
	const wanted = new Set(devIds);
	return new Set([
		...followers.map((row) => row.id),
		...writers.flatMap((row) => [
			...(row.authorId ? [row.authorId] : []),
			...(row.mentionedIds ?? []).filter((id) => wanted.has(id)),
		]),
	]);
}
