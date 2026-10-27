import {
	interruptTurn,
	MAX_PROMPT_CHARS,
	startTurn,
	steerTurn,
} from "@superset/agent-harness/session";
import { db, dbWs } from "@superset/db/client";
import {
	agentRelations,
	agentSessions,
	agents,
	agentTurns,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import { signAgentSessionTicket } from "@superset/shared/usercontent";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { agentTemporal } from "../../lib/agent-runtime";
import { protectedProcedure } from "../../trpc";
import { channelNotFound, loadChannelAccess } from "../channel/access";
import { agentNotFound, assertOrgAdmin, loadManagedAgent } from "./access";

const agentIdSchema = z.object({ agentId: z.string().uuid() });
const channelGrantSchema = z.object({
	agentId: z.string().uuid(),
	channelId: z.string().uuid(),
});

/** People managing and talking to agents. Agents themselves use `agentApi`. */
export const agentRouter = {
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const membership = await findOrgMembership({
				userId: ctx.session.user.id,
				organizationId: input.organizationId,
			});
			if (!membership) return [];
			return db
				.select({
					id: agents.id,
					name: agents.name,
					description: agents.description,
					createdAt: agents.createdAt,
				})
				.from(agents)
				.where(
					and(
						eq(agents.organizationId, input.organizationId),
						isNull(agents.archivedAt),
					),
				)
				.orderBy(asc(agents.name));
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().trim().min(1).max(80),
				description: z.string().trim().max(500).nullish(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertOrgAdmin(ctx.session.user.id, input.organizationId);
			const [agent] = await db
				.insert(agents)
				.values({
					organizationId: input.organizationId,
					name: input.name,
					description: input.description ?? null,
					createdByUserId: ctx.session.user.id,
				})
				.returning();
			if (!agent) throw agentNotFound();
			return agent;
		}),

	/** Revokes everything at once: Melange stops seeing an archived agent's grants. */
	archive: protectedProcedure
		.input(agentIdSchema)
		.mutation(async ({ ctx, input }) => {
			const agent = await loadManagedAgent(ctx.session.user.id, input.agentId);
			await dbWs.transaction(async (tx) => {
				await tx
					.update(agents)
					.set({ archivedAt: new Date() })
					.where(eq(agents.id, agent.id));
				await tx
					.update(agentTurns)
					.set({ status: "interrupted", settledAt: new Date() })
					.where(
						and(
							eq(agentTurns.agentId, agent.id),
							eq(agentTurns.status, "running"),
						),
					);
			});
			return { archived: true };
		}),

	grantChannel: protectedProcedure
		.input(channelGrantSchema)
		.mutation(async ({ ctx, input }) => {
			const agent = await loadManagedAgent(ctx.session.user.id, input.agentId);
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			if (access.channel.organizationId !== agent.organizationId) {
				throw channelNotFound();
			}
			await db
				.insert(agentRelations)
				.values({
					agentId: agent.id,
					relation: "member",
					objectType: "channel",
					objectId: input.channelId,
				})
				.onConflictDoNothing();
			return { granted: true };
		}),

	revokeChannel: protectedProcedure
		.input(channelGrantSchema)
		.mutation(async ({ ctx, input }) => {
			const agent = await loadManagedAgent(ctx.session.user.id, input.agentId);
			await db
				.delete(agentRelations)
				.where(
					and(
						eq(agentRelations.agentId, agent.id),
						eq(agentRelations.relation, "member"),
						eq(agentRelations.objectType, "channel"),
						eq(agentRelations.objectId, input.channelId),
					),
				);
			return { revoked: true };
		}),

	/**
	 * Sends a prompt to the caller's DM with the agent, acting as the caller:
	 * starts a turn, or joins the running one as its `steerSeq`-th steer.
	 * A resent prompt changes nothing. Retries when the running turn settles
	 * between the insert and the join.
	 */
	/** Where the person in a DM reads its live session log. */
	sessionStream: protectedProcedure
		.input(z.object({ sessionId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const session = await loadOwnSession(
				ctx.session.user.id,
				input.sessionId,
			);
			const expiresInSeconds = 15 * 60;
			const ticket = await signAgentSessionTicket(env.AGENT_SESSION_SECRET, {
				sessionId: session.id,
				scope: "read",
				userId: ctx.session.user.id,
				exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
			});
			return {
				url: `${env.REALTIME_URL}/v2/agent-runtime/sessions/${session.id}/stream`,
				baseUrl: `${env.REALTIME_URL}/v2/agent-runtime`,
				ticket,
				expiresInSeconds,
			};
		}),

	interruptTurn: protectedProcedure
		.input(z.object({ sessionId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const session = await loadOwnSession(
				ctx.session.user.id,
				input.sessionId,
			);
			await interruptTurn(await agentTemporal(), session.id);
			return { interrupted: true };
		}),

	startDirectTurn: protectedProcedure
		.input(
			agentIdSchema.extend({
				promptId: z.string().min(1).max(200),
				text: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const [agent] = await db
				.select()
				.from(agents)
				.where(and(eq(agents.id, input.agentId), isNull(agents.archivedAt)))
				.limit(1);
			if (!agent) throw agentNotFound();
			const membership = await findOrgMembership({
				userId,
				organizationId: agent.organizationId,
			});
			if (!membership) throw agentNotFound();

			const place = {
				organizationId: agent.organizationId,
				agentId: agent.id,
				kind: "dm" as const,
				userId,
			};
			await db.insert(agentSessions).values(place).onConflictDoNothing();
			const [session] = await db
				.select({ id: agentSessions.id })
				.from(agentSessions)
				.where(
					and(
						eq(agentSessions.agentId, agent.id),
						eq(agentSessions.kind, "dm"),
						eq(agentSessions.userId, userId),
						isNull(agentSessions.channelId),
						isNull(agentSessions.threadRootId),
					),
				)
				.limit(1);
			if (!session) throw agentNotFound();

			return sendDirect(session.id, agent, userId, input);
		}),

	/** The person's DM sessions, newest first; a cloud workspace narrows them to that box. */
	listSessions: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid().optional(),
				cloudWorkspaceId: z.string().uuid().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			return db
				.select({
					sessionId: agentSessions.id,
					agentId: agents.id,
					agentName: agents.name,
					cloudWorkspaceId: agentSessions.cloudWorkspaceId,
					lastActivityAt: agentSessions.lastActivityAt,
					running: sql<boolean>`exists (select 1 from ${agentTurns} where ${agentTurns.sessionId} = ${agentSessions.id} and ${agentTurns.status} = 'running')`,
				})
				.from(agentSessions)
				.innerJoin(agents, eq(agents.id, agentSessions.agentId))
				.where(
					and(
						input.organizationId
							? eq(agentSessions.organizationId, input.organizationId)
							: undefined,
						eq(agentSessions.kind, "dm"),
						eq(agentSessions.userId, userId),
						isNull(agents.archivedAt),
						input.cloudWorkspaceId
							? eq(agentSessions.cloudWorkspaceId, input.cloudWorkspaceId)
							: undefined,
					),
				)
				.orderBy(desc(agentSessions.lastActivityAt));
		}),

	/** A message in a session the person already has open, as chat sends it. */
	promptSession: protectedProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
				promptId: z.string().min(1).max(200),
				text: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const session = await loadOwnSession(userId, input.sessionId);
			const [agent] = await db
				.select({ id: agents.id, organizationId: agents.organizationId })
				.from(agents)
				.where(eq(agents.id, session.agentId))
				.limit(1);
			if (!agent) throw agentNotFound();
			return sendDirect(session.id, agent, userId, input);
		}),
} satisfies TRPCRouterRecord;

type DirectTurn =
	| { sessionId: string; turnId: string; outcome: "started" }
	| { sessionId: string; turnId: string; outcome: "joined"; steerSeq: number }
	| {
			sessionId: string;
			turnId: string;
			outcome: "duplicate";
			running: boolean;
	  };

async function recordDirectTurn(
	sessionId: string,
	agent: { id: string; organizationId: string },
	userId: string,
	promptId: string,
): Promise<DirectTurn> {
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
				sessionId,
				turnId: duplicate.id,
				outcome: "duplicate" as const,
				running: duplicate.status === "running",
			};
		}
		const [started] = await db
			.insert(agentTurns)
			.values({
				organizationId: agent.organizationId,
				agentId: agent.id,
				sessionId,
				reason: "direct_message",
				actingUserId: userId,
				promptId,
			})
			.onConflictDoNothing()
			.returning({ id: agentTurns.id });
		if (started) {
			return {
				sessionId,
				turnId: started.id,
				outcome: "started" as const,
			};
		}
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
			return {
				sessionId,
				turnId: joined.id,
				outcome: "joined" as const,
				steerSeq: joined.steers,
			};
		}
	}
	throw agentNotFound();
}

async function sendDirect(
	sessionId: string,
	agent: { id: string; organizationId: string },
	userId: string,
	{ promptId, text }: { promptId: string; text: string },
): Promise<DirectTurn> {
	const turn = await recordDirectTurn(sessionId, agent, userId, promptId);
	try {
		await dispatchTurn(sessionId, turn, {
			promptId,
			text,
			actingUserId: userId,
		});
	} catch (error) {
		await forgetUndelivered(turn, promptId);
		throw error;
	}
	return turn;
}

/**
 * A prompt the workflow never got must not hold a turn open: a new turn is
 * removed, and a steer is taken off its turn so settling does not wait for it.
 * The client can then send the same prompt id again.
 */
async function forgetUndelivered(turn: DirectTurn, promptId: string) {
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

/**
 * Hands the turn to its session's workflow. A resent prompt for a turn still
 * running goes again, since the first send may not have landed; the workflow
 * drops prompt ids it has seen.
 */
async function dispatchTurn(
	sessionId: string,
	turn: DirectTurn,
	prompt: { promptId: string; text: string; actingUserId: string },
) {
	if (turn.outcome === "duplicate" && !turn.running) return;
	const temporal = await agentTemporal();
	if (turn.outcome === "started") {
		await startTurn(temporal, sessionId, { turnId: turn.turnId, ...prompt });
		return;
	}
	await steerTurn(temporal, sessionId, {
		turnId: turn.turnId,
		promptId: prompt.promptId,
		text: prompt.text,
	});
}

/** A DM session belongs to the person it is with; anything else reads as not found. */
async function loadOwnSession(userId: string, sessionId: string) {
	const [session] = await db
		.select({ id: agentSessions.id, agentId: agentSessions.agentId })
		.from(agentSessions)
		.innerJoin(agents, eq(agents.id, agentSessions.agentId))
		.where(
			and(
				eq(agentSessions.id, sessionId),
				eq(agentSessions.kind, "dm"),
				eq(agentSessions.userId, userId),
				isNull(agents.archivedAt),
			),
		)
		.limit(1);
	if (!session) throw agentNotFound();
	return session;
}
