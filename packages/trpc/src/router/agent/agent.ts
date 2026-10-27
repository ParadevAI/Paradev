import { db, dbWs } from "@superset/db/client";
import {
	agentRelations,
	agentSessions,
	agents,
	agentTurns,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
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
	startDirectTurn: protectedProcedure
		.input(agentIdSchema.extend({ promptId: z.string().min(1).max(200) }))
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

			const promptId = input.promptId;
			for (let attempt = 0; attempt < 3; attempt++) {
				const [duplicate] = await db
					.select({ id: agentTurns.id })
					.from(agentTurns)
					.where(
						and(
							eq(agentTurns.sessionId, session.id),
							or(
								eq(agentTurns.promptId, promptId),
								sql`${promptId} = any(${agentTurns.steerPromptIds})`,
							),
						),
					)
					.limit(1);
				if (duplicate) {
					return {
						sessionId: session.id,
						turnId: duplicate.id,
						outcome: "duplicate" as const,
					};
				}
				const [started] = await db
					.insert(agentTurns)
					.values({
						organizationId: agent.organizationId,
						agentId: agent.id,
						sessionId: session.id,
						reason: "direct_message",
						actingUserId: userId,
						promptId,
					})
					.onConflictDoNothing()
					.returning({ id: agentTurns.id });
				if (started) {
					return {
						sessionId: session.id,
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
							eq(agentTurns.sessionId, session.id),
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
						sessionId: session.id,
						turnId: joined.id,
						outcome: "joined" as const,
						steerSeq: joined.steers,
					};
				}
			}
			throw agentNotFound();
		}),
} satisfies TRPCRouterRecord;
