import { db } from "@superset/db/client";
import {
	agentSessions,
	agents,
	agentTurns,
	type SelectAgent,
} from "@superset/db/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { agentNotFound } from "./access";

type TurnReason = (typeof agentTurns.$inferInsert)["reason"];

export type TurnOutcome =
	| { turnId: string; outcome: "started" | "duplicate" }
	| { turnId: string; outcome: "joined"; steerSeq: number };

/**
 * Starts a turn in the session, or joins the running one as a steer. A
 * prompt id already seen changes nothing. Retries when the running turn
 * settles between the insert and the join.
 */
export async function startOrJoinTurn(input: {
	agent: SelectAgent;
	sessionId: string;
	actingUserId: string;
	promptId: string;
	reason: TurnReason;
	triggerMessageId?: string;
}): Promise<TurnOutcome> {
	const { agent, sessionId, promptId } = input;
	for (let attempt = 0; attempt < 3; attempt++) {
		const [duplicate] = await db
			.select({ id: agentTurns.id })
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
		if (duplicate) return { turnId: duplicate.id, outcome: "duplicate" };
		const [started] = await db
			.insert(agentTurns)
			.values({
				organizationId: agent.organizationId,
				agentId: agent.id,
				sessionId,
				reason: input.reason,
				actingUserId: input.actingUserId,
				promptId,
				triggerMessageId: input.triggerMessageId ?? null,
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

/** A person wrote in their DM with a Dev: the Dev takes it as a turn, unless paused. */
async function startTurnForDirectMessage(
	channelId: string,
	userId: string,
	messageId: string,
) {
	const [row] = await db
		.select({ sessionId: agentSessions.id, agent: agents })
		.from(agentSessions)
		.innerJoin(agents, eq(agents.id, agentSessions.agentId))
		.where(
			and(
				eq(agentSessions.channelId, channelId),
				eq(agentSessions.kind, "dm"),
				eq(agentSessions.userId, userId),
				isNull(agents.archivedAt),
				isNull(agents.pausedAt),
			),
		)
		.limit(1);
	if (!row) return null;
	return startOrJoinTurn({
		agent: row.agent,
		sessionId: row.sessionId,
		actingUserId: userId,
		promptId: messageId,
		reason: "direct_message",
		triggerMessageId: messageId,
	});
}

/**
 * Starts the turns a person's message asks for. In a DM, its Dev answers.
 * In a channel, each mentioned Dev works in the message's thread (mentioned
 * people match no agent), and a
 * reply in a thread a Dev already works in continues that work.
 */
export async function startTurnsForMessage(
	channel: { id: string; kind: "channel" | "dm" },
	message: {
		id: string;
		threadRootId: string | null;
		mentionedIds: string[];
	},
	userId: string,
) {
	if (channel.kind === "dm") {
		await startTurnForDirectMessage(channel.id, userId, message.id);
		return;
	}
	const threadRootId = message.threadRootId ?? message.id;
	const mentioned = message.mentionedIds.length
		? await db
				.select()
				.from(agents)
				.where(
					and(
						inArray(agents.id, message.mentionedIds),
						isNull(agents.archivedAt),
						isNull(agents.pausedAt),
					),
				)
		: [];
	const following = message.threadRootId
		? await db
				.select({ session: agentSessions, agent: agents })
				.from(agentSessions)
				.innerJoin(agents, eq(agents.id, agentSessions.agentId))
				.where(
					and(
						eq(agentSessions.kind, "thread"),
						eq(agentSessions.threadRootId, message.threadRootId),
						isNull(agents.archivedAt),
						isNull(agents.pausedAt),
					),
				)
		: [];
	const mentionedIds = new Set(mentioned.map((agent) => agent.id));
	const work = [
		...mentioned.map((agent) => ({ agent, reason: "mention" as const })),
		...following
			.filter(({ agent }) => !mentionedIds.has(agent.id))
			.map(({ agent }) => ({ agent, reason: "thread_reply" as const })),
	];
	const results = await Promise.allSettled(
		work.map(async ({ agent, reason }) => {
			const sessionId = await ensureThreadSession(
				agent,
				channel.id,
				threadRootId,
			);
			return startOrJoinTurn({
				agent,
				sessionId,
				actingUserId: userId,
				promptId: message.id,
				reason,
				triggerMessageId: message.id,
			});
		}),
	);
	for (const result of results) {
		if (result.status === "rejected") {
			console.error("[agent-turns] couldn't start a turn", result.reason);
		}
	}
}

async function ensureThreadSession(
	agent: SelectAgent,
	channelId: string,
	threadRootId: string,
): Promise<string> {
	await db
		.insert(agentSessions)
		.values({
			organizationId: agent.organizationId,
			agentId: agent.id,
			kind: "thread",
			channelId,
			threadRootId,
		})
		.onConflictDoNothing();
	const [session] = await db
		.select({ id: agentSessions.id })
		.from(agentSessions)
		.where(
			and(
				eq(agentSessions.agentId, agent.id),
				eq(agentSessions.kind, "thread"),
				eq(agentSessions.threadRootId, threadRootId),
			),
		)
		.limit(1);
	if (!session) throw new Error("thread session missing after insert");
	return session.id;
}
