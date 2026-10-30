import {
	interruptTurn,
	MAX_PROMPT_CHARS,
} from "@superset/agent-harness/session";
import { db, dbWs } from "@superset/db/client";
import {
	agentSessions,
	agents,
	agentTurns,
	channelMembers,
	channelMessages,
	channels,
	members,
	tasks,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import {
	type DevAvatar,
	isDevAvatar,
	randomDevAvatar,
} from "@superset/shared/dev-avatar";
import { signAgentSessionTicket } from "@superset/shared/usercontent";
import type { TRPCRouterRecord } from "@trpc/server";
import {
	and,
	asc,
	desc,
	eq,
	exists,
	inArray,
	isNull,
	or,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { agentTemporal } from "../../lib/agent-runtime";
import { protectedProcedure } from "../../trpc";
import { agentNotFound, loadAgentAccess, loadManagedAgent } from "./access";
import { announceAgentChanged } from "./agents-changed";
import { ensureDirectMessage } from "./direct-message";
import { eventText, submitPrompt } from "./turns";

const agentIdSchema = z.object({ agentId: z.string().uuid() });
const ACTIVITY_PAGE_SIZE = 50;
const avatarSchema = z.custom<DevAvatar>(isDevAvatar, "Invalid avatar");
const nameSchema = z.string().trim().min(1).max(80);

const listColumns = {
	id: agents.id,
	name: agents.name,
	description: agents.description,
	avatar: agents.avatar,
	pausedAt: agents.pausedAt,
	createdByUserId: agents.createdByUserId,
	createdAt: agents.createdAt,
	/** @deprecated Read by desktop 2.0.1; newer clients read `agent.get().working`. */
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
		const [[row], grants, [running], recentTurns] = await Promise.all([
			db.select(listColumns).from(agents).where(eq(agents.id, agent.id)),
			db
				.select({ id: channels.id, name: channels.name })
				.from(channelMembers)
				.innerJoin(channels, eq(channels.id, channelMembers.channelId))
				.where(
					and(
						eq(channelMembers.actorId, agent.id),
						eq(channels.kind, "channel"),
						isNull(channels.archivedAt),
					),
				)
				.orderBy(asc(channels.name)),
			db
				.select({ reason: agentTurns.reason })
				.from(agentTurns)
				.where(
					and(
						eq(agentTurns.agentId, agent.id),
						eq(agentTurns.status, "running"),
					),
				)
				.orderBy(desc(agentTurns.startedAt))
				.limit(1),
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
			canManage,
			channels: grants,
			working: running ?? null,
			/** @deprecated Read by desktop 2.0.1; newer clients use `agent.activity`. */
			recentTurns,
		};
	}),

	/** A Dev's turns, newest first, only where the caller can see them: their own DM with it and channels they can read. */
	activity: protectedProcedure
		.input(
			agentIdSchema.extend({
				/** The id of the last turn on the previous page. */
				cursor: z.string().uuid().nullish(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const { agent } = await loadAgentAccess(userId, input.agentId);
			const rows = await db
				.select({
					id: agentTurns.id,
					status: agentTurns.status,
					reason: agentTurns.reason,
					startedAt: agentTurns.startedAt,
					settledAt: agentTurns.settledAt,
					actingUserId: agentTurns.actingUserId,
					channelId: channels.id,
					channelName: channels.name,
					channelKind: channels.kind,
					threadRootId: sql<
						string | null
					>`case when ${channels.kind} = 'dm' then null else coalesce(${channelMessages.threadRootId}, ${channelMessages.id}, ${agentSessions.threadRootId}) end`,
				})
				.from(agentTurns)
				.innerJoin(agentSessions, eq(agentSessions.id, agentTurns.sessionId))
				.leftJoin(
					channelMessages,
					eq(channelMessages.id, agentTurns.triggerMessageId),
				)
				.innerJoin(
					channels,
					eq(
						channels.id,
						sql`coalesce(${channelMessages.channelId}, ${agentSessions.channelId})`,
					),
				)
				.where(
					and(
						eq(agentTurns.agentId, agent.id),
						input.cursor
							? sql`(${agentTurns.startedAt}, ${agentTurns.id}) < (select t.started_at, t.id from ${agentTurns} t where t.id = ${input.cursor})`
							: undefined,
						or(
							eq(channels.visibility, "public"),
							exists(
								db
									.select({ one: sql`1` })
									.from(channelMembers)
									.where(
										and(
											eq(channelMembers.channelId, channels.id),
											eq(channelMembers.actorId, userId),
										),
									),
							),
						),
					),
				)
				.orderBy(desc(agentTurns.startedAt), desc(agentTurns.id))
				.limit(ACTIVITY_PAGE_SIZE);
			return {
				turns: rows,
				nextCursor:
					rows.length === ACTIVITY_PAGE_SIZE ? (rows.at(-1)?.id ?? null) : null,
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
			announceAgentChanged(agent);
			return agent;
		}),

	update: protectedProcedure
		.input(
			agentIdSchema.extend({
				name: nameSchema.optional(),
				description: z.string().trim().max(500).nullish(),
				avatar: avatarSchema.optional(),
				instructions: z.string().max(8000).nullish(),
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
			announceAgentChanged(agent);
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
			announceAgentChanged(agent);
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
			announceAgentChanged(agent);
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
			announceAgentChanged(agent);
			return { archived: true };
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

	/** Where the person in a DM reads its live session log. */
	sessionStream: protectedProcedure
		.input(z.object({ sessionId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const session = await loadViewableSession(
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
			const session = await loadViewableSession(
				ctx.session.user.id,
				input.sessionId,
			);
			await interruptTurn(await agentTemporal(), session.id);
			return { interrupted: true };
		}),

	/**
	 * The main and task sessions of Devs the person manages, newest first; a
	 * cloud workspace narrows them to that box. A main session holds everything
	 * a Dev was told, so only its creator and org admins look inside.
	 */
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
					kind: agentSessions.kind,
					title: tasks.title,
					taskStatus: agentSessions.taskStatus,
					cloudWorkspaceId: agentSessions.cloudWorkspaceId,
					lastActivityAt: agentSessions.lastActivityAt,
					running: sql<boolean>`exists (select 1 from ${agentTurns} where ${agentTurns.sessionId} = ${agentSessions.id} and ${agentTurns.status} = 'running')`,
				})
				.from(agentSessions)
				.innerJoin(agents, eq(agents.id, agentSessions.agentId))
				.leftJoin(tasks, eq(tasks.id, agentSessions.taskId))
				.innerJoin(
					members,
					and(
						eq(members.organizationId, agents.organizationId),
						eq(members.userId, userId),
					),
				)
				.where(
					and(
						input.organizationId
							? eq(agentSessions.organizationId, input.organizationId)
							: undefined,
						inArray(agentSessions.kind, ["main", "task"]),
						isNull(agents.archivedAt),
						or(
							eq(agents.createdByUserId, userId),
							inArray(members.role, ["owner", "admin"]),
						),
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
			const session = await loadViewableSession(userId, input.sessionId);
			const [agent] = await db
				.select({ id: agents.id, organizationId: agents.organizationId })
				.from(agents)
				.where(eq(agents.id, session.agentId))
				.limit(1);
			if (!agent) throw agentNotFound();
			const turn = await submitPrompt({
				agent,
				sessionId: session.id,
				actingUserId: userId,
				promptId: input.promptId,
				text: eventText({
					from: ctx.session.user.name,
					where: "the session view",
					replyTo: null,
					body: input.text,
				}),
				reason: "direct_message",
			});
			return { sessionId: session.id, ...turn };
		}),
} satisfies TRPCRouterRecord;

/** A Dev's main or task session, for the people who manage the Dev; anything else reads as not found. */
async function loadViewableSession(userId: string, sessionId: string) {
	const [session] = await db
		.select({ id: agentSessions.id, agentId: agentSessions.agentId })
		.from(agentSessions)
		.where(
			and(
				eq(agentSessions.id, sessionId),
				inArray(agentSessions.kind, ["main", "task"]),
			),
		)
		.limit(1);
	if (!session) throw agentNotFound();
	const { canManage } = await loadAgentAccess(userId, session.agentId);
	if (!canManage) throw agentNotFound();
	return session;
}
