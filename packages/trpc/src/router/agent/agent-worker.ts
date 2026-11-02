import { db } from "@superset/db/client";
import {
	agentSessions,
	agents,
	agentTurns,
	channelMessages,
	channels,
	tasks,
} from "@superset/db/schema";
import { signAgentSessionTicket } from "@superset/shared/usercontent";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { agentTemporal } from "../../lib/agent-runtime";
import {
	signTurnToken,
	TURN_TOKEN_TTL_SECONDS,
} from "../../lib/agent-turn/turn-token";
import { posthog } from "../../lib/analytics";
import { workerProcedure } from "../../trpc";
import { announceAgentChanged } from "./agents-changed";
import { reconcileDevs } from "./reconcile";
import { fireDueRoutines } from "./routines";
import { afterTaskTurn } from "./tasks";
import { resolveTurnHost } from "./turn-host";

const turnIdSchema = z.object({ turnId: z.string().uuid() });
const turnNotRunning = () =>
	new TRPCError({ code: "NOT_FOUND", message: "Turn is not running." });

/** A settled turn still owes its session log the end marker, so settling hands out a ticket too. */
async function sessionStoreFor(sessionId: string) {
	return {
		baseUrl: env.REALTIME_URL,
		writeTicket: await signAgentSessionTicket(env.AGENT_SESSION_SECRET, {
			sessionId,
			scope: "write",
			exp: Math.floor(Date.now() / 1000) + TURN_TOKEN_TTL_SECONDS,
		}),
	};
}

/** Where an answer to a message goes: its thread in a channel, or the DM itself. */
async function replyRoomOf(messageId: string) {
	const [row] = await db
		.select({
			id: channelMessages.id,
			channelId: channelMessages.channelId,
			threadRootId: channelMessages.threadRootId,
			kind: channels.kind,
		})
		.from(channelMessages)
		.innerJoin(channels, eq(channels.id, channelMessages.channelId))
		.where(eq(channelMessages.id, messageId))
		.limit(1);
	if (!row) return null;
	return {
		channelId: row.channelId,
		threadRootId:
			row.kind === "dm" ? row.threadRootId : (row.threadRootId ?? row.id),
	};
}

/** Our worker: it may only pick up turns the API created, and only while they run. */
export const agentWorkerRouter = {
	/** Runs from the worker every minute: repairs Devs, then runs the routines that are due. */
	reconcile: workerProcedure.mutation(async () => ({
		...(await reconcileDevs(await agentTemporal())),
		routinesRun: await fireDueRoutines(),
	})),

	/** A turn attempt failed and Temporal will run it again. */
	noteRetry: workerProcedure
		.input(
			turnIdSchema.extend({
				attempt: z.number().int().positive(),
				error: z.string().max(2000),
			}),
		)
		.mutation(async ({ input }) => {
			const [turn] = await db
				.update(agentTurns)
				.set({ attempts: input.attempt + 1, lastAttemptError: input.error })
				.where(
					and(
						eq(agentTurns.id, input.turnId),
						eq(agentTurns.status, "running"),
					),
				)
				.returning({ agentId: agentTurns.agentId, reason: agentTurns.reason });
			if (turn) {
				posthog.capture({
					distinctId: turn.agentId,
					event: "dev_turn_retried",
					properties: {
						turnId: input.turnId,
						attempt: input.attempt,
						reason: turn.reason,
						error: input.error.slice(0, 300),
					},
				});
			}
			return { recorded: Boolean(turn) };
		}),

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

	/**
	 * What a running turn may touch: its session log, its box, the model as
	 * the box, and the room people read it in, with the Dev's token for
	 * posting there.
	 */
	turnCredentials: workerProcedure
		.input(turnIdSchema)
		.mutation(async ({ input }) => {
			const [turn] = await db
				.select({
					turnId: agentTurns.id,
					sessionId: agentTurns.sessionId,
					agentId: agentTurns.agentId,
					organizationId: agentTurns.organizationId,
					actingUserId: agentTurns.actingUserId,
					cloudWorkspaceId: agentSessions.cloudWorkspaceId,
					kind: agentSessions.kind,
					role: agentSessions.role,
					title: tasks.title,
					devName: agents.name,
					devDescription: agents.description,
					devInstructions: agents.instructions,
					triggerMessageId: agentTurns.triggerMessageId,
				})
				.from(agentTurns)
				.innerJoin(agents, eq(agents.id, agentTurns.agentId))
				.innerJoin(agentSessions, eq(agentSessions.id, agentTurns.sessionId))
				.leftJoin(tasks, eq(tasks.id, agentSessions.taskId))
				.where(
					and(
						eq(agentTurns.id, input.turnId),
						eq(agentTurns.status, "running"),
						isNull(agents.archivedAt),
					),
				)
				.limit(1);
			if (!turn) throw turnNotRunning();
			const access = turn.cloudWorkspaceId
				? await resolveTurnHost({
						...turn,
						cloudWorkspaceId: turn.cloudWorkspaceId,
					})
				: null;
			const identity = {
				turnId: turn.turnId,
				sessionId: turn.sessionId,
				agentId: turn.agentId,
				organizationId: turn.organizationId,
				actingUserId: turn.actingUserId,
			};
			return {
				sessionStore: await sessionStoreFor(turn.sessionId),
				organizationId: turn.organizationId,
				host: access?.host ?? null,
				model: access ? { headers: access.modelHeaders } : null,
				room:
					turn.kind === "main" && turn.triggerMessageId
						? await replyRoomOf(turn.triggerMessageId)
						: null,
				dev: {
					name: turn.devName,
					description: turn.devDescription,
					instructions: turn.devInstructions,
				},
				session: { kind: turn.kind, role: turn.role, title: turn.title },
				tools:
					turn.kind === "main"
						? { mcpUrl: `${env.NEXT_PUBLIC_API_URL}/mcp/agent` }
						: null,
				agentToken: await signTurnToken(
					env.AGENT_TURN_SIGNING_SECRET,
					identity,
				),
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
				.returning({
					sessionId: agentTurns.sessionId,
					agentId: agentTurns.agentId,
					organizationId: agentTurns.organizationId,
				});
			if (!settled) {
				const [turn] = await db
					.select({
						status: agentTurns.status,
						sessionId: agentTurns.sessionId,
						agentId: agentTurns.agentId,
						organizationId: agentTurns.organizationId,
					})
					.from(agentTurns)
					.where(eq(agentTurns.id, turnId))
					.limit(1);
				if (!turn) throw turnNotRunning();
				if (turn.status === "running") {
					throw new TRPCError({
						code: "CONFLICT",
						message: "STEER_PENDING: a newer steer joined the turn.",
					});
				}
				announceAgentChanged({
					id: turn.agentId,
					organizationId: turn.organizationId,
				});
				await afterTaskTurn(turnId);
				return {
					settled: true,
					sessionStore: await sessionStoreFor(turn.sessionId),
				};
			}
			await db
				.update(agentSessions)
				.set({ lastActivityAt: now })
				.where(eq(agentSessions.id, settled.sessionId));
			announceAgentChanged({
				id: settled.agentId,
				organizationId: settled.organizationId,
			});
			// A retried settle runs this again; the parent hears each turn once.
			await afterTaskTurn(turnId);
			return {
				settled: true,
				sessionStore: await sessionStoreFor(settled.sessionId),
			};
		}),
} satisfies TRPCRouterRecord;
