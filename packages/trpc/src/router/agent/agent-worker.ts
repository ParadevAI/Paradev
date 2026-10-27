import { db } from "@superset/db/client";
import { agentSessions, agents, agentTurns } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import {
	signTurnToken,
	TURN_TOKEN_TTL_SECONDS,
} from "../../lib/agent-turn/turn-token";
import { workerProcedure } from "../../trpc";

const turnIdSchema = z.object({ turnId: z.string().uuid() });
const turnNotRunning = () =>
	new TRPCError({ code: "NOT_FOUND", message: "Turn is not running." });

/** Our worker: it may only pick up turns the API created, and only while they run. */
export const agentWorkerRouter = {
	turnToken: workerProcedure.input(turnIdSchema).mutation(async ({ input }) => {
		const [turn] = await db
			.select({
				turnId: agentTurns.id,
				sessionId: agentTurns.sessionId,
				agentId: agentTurns.agentId,
				organizationId: agentTurns.organizationId,
				actingUserId: agentTurns.actingUserId,
			})
			.from(agentTurns)
			.innerJoin(agents, eq(agents.id, agentTurns.agentId))
			.where(
				and(
					eq(agentTurns.id, input.turnId),
					eq(agentTurns.status, "running"),
					isNull(agents.archivedAt),
				),
			)
			.limit(1);
		if (!turn) throw turnNotRunning();
		return {
			token: await signTurnToken(env.AGENT_TURN_SIGNING_SECRET, turn),
			expiresInSeconds: TURN_TOKEN_TTL_SECONDS,
		};
	}),

	settleTurn: workerProcedure
		.input(
			turnIdSchema.extend({
				status: z.enum(["completed", "failed", "interrupted"]),
				/** How many steers the worker read; settling fails while a newer one waits. */
				steersConsumed: z.number().int().nonnegative(),
				reply: z.string().nullish(),
				toolCalls: z
					.array(
						z.object({
							name: z.string(),
							summary: z.string(),
							status: z.string(),
						}),
					)
					.nullish(),
				inputTokens: z.number().int().nonnegative().nullish(),
				outputTokens: z.number().int().nonnegative().nullish(),
				costMicrosUsd: z.number().int().nonnegative().nullish(),
				errorCode: z.string().nullish(),
			}),
		)
		.mutation(async ({ input: { turnId, steersConsumed, ...result } }) => {
			const now = new Date();
			const [settled] = await db
				.update(agentTurns)
				.set({ ...result, settledAt: now })
				.where(
					and(
						eq(agentTurns.id, turnId),
						eq(agentTurns.status, "running"),
						sql`cardinality(${agentTurns.steerPromptIds}) = ${steersConsumed}`,
					),
				)
				.returning({ sessionId: agentTurns.sessionId });
			if (!settled) {
				const [turn] = await db
					.select({ status: agentTurns.status })
					.from(agentTurns)
					.where(eq(agentTurns.id, turnId))
					.limit(1);
				if (turn?.status === "running") {
					throw new TRPCError({
						code: "CONFLICT",
						message: "STEER_PENDING: a newer steer joined the turn.",
					});
				}
				throw turnNotRunning();
			}
			await db
				.update(agentSessions)
				.set({ lastActivityAt: now })
				.where(eq(agentSessions.id, settled.sessionId));
			return { settled: true };
		}),
} satisfies TRPCRouterRecord;
