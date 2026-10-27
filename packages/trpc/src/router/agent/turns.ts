import { db } from "@superset/db/client";
import {
	agentSessions,
	agents,
	agentTurns,
	type SelectAgent,
} from "@superset/db/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
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
export async function startTurnForDirectMessage(
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
