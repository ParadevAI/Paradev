import { db, dbWs } from "@superset/db/client";
import {
	agentRelations,
	agents,
	agentTurns,
	channels,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import {
	type DevAvatar,
	isDevAvatar,
	randomDevAvatar,
} from "@superset/shared/dev-avatar";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, exists, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { userError } from "../../i18n-error";
import { protectedProcedure } from "../../trpc";
import { channelNotFound, loadChannelAccess } from "../channel/access";
import { agentNotFound, loadAgentAccess, loadManagedAgent } from "./access";
import { ensureDirectMessage } from "./direct-message";
import { startOrJoinTurn } from "./turns";

const agentIdSchema = z.object({ agentId: z.string().uuid() });
const avatarSchema = z.custom<DevAvatar>(isDevAvatar, "Invalid avatar");
const nameSchema = z.string().trim().min(1).max(80);

const listColumns = {
	id: agents.id,
	name: agents.name,
	description: agents.description,
	avatar: agents.avatar,
	messageAccess: agents.messageAccess,
	pausedAt: agents.pausedAt,
	createdByUserId: agents.createdByUserId,
	createdAt: agents.createdAt,
	isWorking: exists(
		db
			.select({ one: sql`1` })
			.from(agentTurns)
			.where(
				and(
					eq(agentTurns.agentId, agents.id),
					eq(agentTurns.status, "running"),
				),
			),
	).mapWith(Boolean),
};
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
				.select(listColumns)
				.from(agents)
				.where(
					and(
						eq(agents.organizationId, input.organizationId),
						isNull(agents.archivedAt),
						or(
							eq(agents.messageAccess, "organization"),
							eq(agents.createdByUserId, ctx.session.user.id),
						),
					),
				)
				.orderBy(asc(agents.createdAt));
		}),

	/** One agent with what its page shows: the channels it is in and its recent turns. */
	get: protectedProcedure.input(agentIdSchema).query(async ({ ctx, input }) => {
		const { agent, canManage } = await loadAgentAccess(
			ctx.session.user.id,
			input.agentId,
		);
		const [[row], grants, recentTurns] = await Promise.all([
			db.select(listColumns).from(agents).where(eq(agents.id, agent.id)),
			db
				.select({ id: channels.id, name: channels.name })
				.from(agentRelations)
				.innerJoin(channels, eq(channels.id, agentRelations.objectId))
				.where(
					and(
						eq(agentRelations.agentId, agent.id),
						eq(agentRelations.objectType, "channel"),
						eq(channels.kind, "channel"),
						isNull(channels.archivedAt),
					),
				)
				.orderBy(asc(channels.name)),
			db
				.select({
					id: agentTurns.id,
					status: agentTurns.status,
					reason: agentTurns.reason,
					startedAt: agentTurns.startedAt,
					settledAt: agentTurns.settledAt,
				})
				.from(agentTurns)
				.where(eq(agentTurns.agentId, agent.id))
				.orderBy(desc(agentTurns.startedAt))
				.limit(10),
		]);
		if (!row) throw agentNotFound();
		return {
			...row,
			instructions: agent.instructions,
			model: agent.model,
			canManage,
			channels: grants,
			recentTurns,
		};
	}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: nameSchema,
				description: z.string().trim().max(500).nullish(),
				avatar: avatarSchema.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const membership = await findOrgMembership({
				userId: ctx.session.user.id,
				organizationId: input.organizationId,
			});
			if (!membership) throw agentNotFound();
			const [agent] = await db
				.insert(agents)
				.values({
					organizationId: input.organizationId,
					name: input.name,
					description: input.description ?? null,
					avatar: input.avatar ?? randomDevAvatar(),
					createdByUserId: ctx.session.user.id,
				})
				.returning();
			if (!agent) throw agentNotFound();
			return agent;
		}),

	update: protectedProcedure
		.input(
			agentIdSchema.extend({
				name: nameSchema.optional(),
				description: z.string().trim().max(500).nullish(),
				avatar: avatarSchema.optional(),
				instructions: z.string().max(8000).nullish(),
				model: z.string().max(100).nullish(),
				messageAccess: z.enum(["organization", "creator"]).optional(),
			}),
		)
		.mutation(async ({ ctx, input: { agentId, ...changes } }) => {
			const agent = await loadManagedAgent(ctx.session.user.id, agentId);
			const [updated] = await db
				.update(agents)
				.set(changes)
				.where(eq(agents.id, agent.id))
				.returning({ id: agents.id });
			if (!updated) throw agentNotFound();
			return updated;
		}),

	/** A paused agent starts no turns until it is resumed. */
	pause: protectedProcedure
		.input(agentIdSchema)
		.mutation(async ({ ctx, input }) => {
			const agent = await loadManagedAgent(ctx.session.user.id, input.agentId);
			await db
				.update(agents)
				.set({ pausedAt: new Date() })
				.where(and(eq(agents.id, agent.id), isNull(agents.pausedAt)));
			return { paused: true };
		}),

	resume: protectedProcedure
		.input(agentIdSchema)
		.mutation(async ({ ctx, input }) => {
			const agent = await loadManagedAgent(ctx.session.user.id, input.agentId);
			await db
				.update(agents)
				.set({ pausedAt: null })
				.where(eq(agents.id, agent.id));
			return { paused: false };
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
			const { agent } = await loadAgentAccess(userId, input.agentId);
			if (agent.pausedAt) {
				throw userError({
					code: "PRECONDITION_FAILED",
					message: "This agent is paused",
					i18nKey: "serverError.agent.paused",
				});
			}

			const { sessionId } = await ensureDirectMessage(agent, userId);
			const turn = await startOrJoinTurn({
				agent,
				sessionId,
				actingUserId: userId,
				promptId: input.promptId,
				reason: "direct_message",
			});
			return { sessionId, ...turn };
		}),

	/** The caller's DM room with a Dev, made on first open. */
	openDirectMessage: protectedProcedure
		.input(agentIdSchema)
		.mutation(async ({ ctx, input }) => {
			const { agent } = await loadAgentAccess(
				ctx.session.user.id,
				input.agentId,
			);
			return ensureDirectMessage(agent, ctx.session.user.id);
		}),
} satisfies TRPCRouterRecord;
