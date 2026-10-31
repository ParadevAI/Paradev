import { interruptTurn } from "@superset/agent-harness/session";
import { db } from "@superset/db/client";
import {
	agentMemories,
	agentSessions,
	agents,
	agentTaskRoleEnum,
	agentTurns,
	channels,
	environments,
	taskStatuses,
	tasks,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { agentTemporal } from "../../lib/agent-runtime";
import { channelNotFound } from "../channel/access";
import { postAgentMessage } from "../channel/channel-message";
import { devRoutineTools } from "./dev-routine-tools";
import { mainProcedure } from "./main-procedure";
import { fillSlots, startTask } from "./tasks";
import { parseReplyTarget, REPLY_TARGET, submitPrompt } from "./turns";

const MAX_MEMORIES = 50;

const taskNotFound = () =>
	new TRPCError({ code: "NOT_FOUND", message: "No such task." });

const lastReply = sql<
	string | null
>`(select t.reply from ${agentTurns} t where t.session_id = ${agentSessions.id} order by t.started_at desc limit 1)`;

interface WorkItem {
	taskId: string;
	slug: string;
	title: string;
	status: string;
	pullRequestUrl: string | null;
	summary: string | null;
	sessions: Array<{
		sessionId: string;
		role: string | null;
		status: string | null;
	}>;
}

/** A task this Dev has worked on, and its sessions, oldest first. */
async function devTask(
	turn: { agentId: string; organizationId: string },
	taskId: string,
) {
	const [task] = await db
		.select({
			taskId: tasks.id,
			slug: tasks.slug,
			title: tasks.title,
			description: tasks.description,
			status: taskStatuses.name,
			pullRequestUrl: tasks.prUrl,
		})
		.from(tasks)
		.innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
		.where(
			and(
				eq(tasks.id, taskId),
				eq(tasks.organizationId, turn.organizationId),
				isNull(tasks.deletedAt),
			),
		)
		.limit(1);
	if (!task) throw taskNotFound();
	const sessions = await db
		.select({
			sessionId: agentSessions.id,
			role: agentSessions.role,
			status: agentSessions.taskStatus,
			cloudWorkspaceId: agentSessions.cloudWorkspaceId,
			reply: lastReply,
		})
		.from(agentSessions)
		.where(
			and(
				eq(agentSessions.taskId, taskId),
				eq(agentSessions.agentId, turn.agentId),
			),
		)
		.orderBy(asc(agentSessions.createdAt));
	if (sessions.length === 0) throw taskNotFound();
	return { task, sessions };
}

/**
 * The tools a Dev's main session works with, served to pdev over MCP. They
 * act as the Dev: posting needs the Dev's own access to the room, since one
 * turn may answer several people.
 */
export const devToolsRouter = {
	reply: mainProcedure
		.input(
			z.object({
				target: z.string().regex(REPLY_TARGET),
				body: z.string().min(1).max(40_000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const target = parseReplyTarget(input.target);
			if (!target) throw channelNotFound();
			const { channelId, threadRootId } = target;
			const { rows } = await db.execute<{ allowed: number }>(
				sql`select authz.check_permission('agent', ${ctx.agentTurn.agentId}, 'can_post', 'channel', ${channelId}) as allowed`,
			);
			if (rows[0]?.allowed !== 1) throw channelNotFound();
			const [channel] = await db
				.select()
				.from(channels)
				.where(eq(channels.id, channelId))
				.limit(1);
			if (channel?.organizationId !== ctx.agentTurn.organizationId) {
				throw channelNotFound();
			}
			const [agent] = await db
				.select({ name: agents.name })
				.from(agents)
				.where(eq(agents.id, ctx.agentTurn.agentId))
				.limit(1);
			const message = await postAgentMessage({
				channel,
				agentId: ctx.agentTurn.agentId,
				agentName: agent?.name ?? "",
				body: input.body,
				threadRootId,
			});
			return { messageId: message.id };
		}),

	listWork: mainProcedure.query(async ({ ctx }) => {
		const rows = await db
			.select({
				taskId: tasks.id,
				slug: tasks.slug,
				title: tasks.title,
				status: taskStatuses.name,
				pullRequestUrl: tasks.prUrl,
				sessionId: agentSessions.id,
				role: agentSessions.role,
				sessionStatus: agentSessions.taskStatus,
				reply: lastReply,
			})
			.from(agentSessions)
			.innerJoin(tasks, eq(tasks.id, agentSessions.taskId))
			.innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
			.where(
				and(
					eq(agentSessions.agentId, ctx.agentTurn.agentId),
					isNull(tasks.deletedAt),
				),
			)
			.orderBy(desc(agentSessions.createdAt))
			.limit(60);
		const work = new Map<string, WorkItem>();
		for (const row of rows) {
			const item = work.get(row.taskId) ?? {
				taskId: row.taskId,
				slug: row.slug,
				title: row.title,
				status: row.status,
				pullRequestUrl: row.pullRequestUrl,
				summary: row.reply ? row.reply.slice(0, 400) : null,
				sessions: [],
			};
			item.sessions.push({
				sessionId: row.sessionId,
				role: row.role,
				status: row.sessionStatus,
			});
			work.set(row.taskId, item);
		}
		return [...work.values()].slice(0, 30);
	}),

	readTask: mainProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const { task, sessions } = await devTask(ctx.agentTurn, input.taskId);
			return { ...task, sessions };
		}),

	startTask: mainProcedure
		.input(
			z
				.object({
					taskId: z.string().uuid().optional(),
					title: z.string().min(1).max(200).optional(),
					instructions: z.string().min(1).max(20_000),
					role: agentTaskRoleEnum.default("writer"),
					environmentId: z.string().uuid().optional(),
				})
				.refine((input) => input.taskId || input.title, {
					message:
						"Pass a title for a new task, or the taskId of one to work on",
				})
				.refine((input) => input.role !== "reviewer" || input.taskId, {
					message: "A reviewer works on an existing task: pass its taskId",
				}),
		)
		.mutation(async ({ ctx, input }) =>
			startTask({
				agentId: ctx.agentTurn.agentId,
				organizationId: ctx.agentTurn.organizationId,
				parentSessionId: ctx.agentTurn.sessionId,
				requestedByUserId: ctx.agentTurn.actingUserId,
				...input,
			}),
		),

	messageTask: mainProcedure
		.input(
			z.object({
				taskId: z.string().uuid(),
				text: z.string().min(1).max(20_000),
				role: agentTaskRoleEnum.default("writer"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { sessions } = await devTask(ctx.agentTurn, input.taskId);
			const session = sessions.filter((row) => row.role === input.role).at(-1);
			if (!session) throw taskNotFound();
			if (session.status === "queued") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						"The task has not started yet; it reads this when it starts.",
				});
			}
			const [agent] = await db
				.select({ id: agents.id, organizationId: agents.organizationId })
				.from(agents)
				.where(eq(agents.id, ctx.agentTurn.agentId))
				.limit(1);
			if (!agent) throw taskNotFound();
			await db
				.update(agentSessions)
				.set({ taskStatus: "running" })
				.where(eq(agentSessions.id, session.sessionId));
			const outcome = await submitPrompt({
				agent,
				sessionId: session.sessionId,
				actingUserId: ctx.agentTurn.actingUserId,
				promptId: `parent:${ctx.agentTurn.turnId}:${crypto.randomUUID()}`,
				text: input.text,
				reason: "task_update",
			});
			return { delivered: outcome.outcome };
		}),

	stopTask: mainProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { sessions } = await devTask(ctx.agentTurn, input.taskId);
			const active = sessions.filter(
				(row) => row.status === "queued" || row.status === "running",
			);
			for (const session of active) {
				await db
					.update(agentSessions)
					.set({ taskStatus: "stopped" })
					.where(eq(agentSessions.id, session.sessionId));
				if (session.status === "running") {
					await interruptTurn(await agentTemporal(), session.sessionId).catch(
						() => {},
					);
				}
			}
			await fillSlots(ctx.agentTurn.agentId);
			return { stopped: active.length };
		}),

	remember: mainProcedure
		.input(z.object({ content: z.string().min(1).max(4_000) }))
		.mutation(async ({ ctx, input }) => {
			const [memory] = await db
				.insert(agentMemories)
				.values({
					organizationId: ctx.agentTurn.organizationId,
					agentId: ctx.agentTurn.agentId,
					content: input.content,
				})
				.returning({ id: agentMemories.id });
			return { id: memory?.id };
		}),

	recall: mainProcedure
		.input(z.object({ query: z.string().max(200).optional() }))
		.query(async ({ ctx, input }) => {
			return db
				.select({
					content: agentMemories.content,
					createdAt: agentMemories.createdAt,
				})
				.from(agentMemories)
				.where(
					and(
						eq(agentMemories.agentId, ctx.agentTurn.agentId),
						input.query
							? ilike(agentMemories.content, `%${input.query}%`)
							: undefined,
					),
				)
				.orderBy(desc(agentMemories.createdAt))
				.limit(MAX_MEMORIES);
		}),

	listEnvironments: mainProcedure.query(async ({ ctx }) => {
		const [agent] = await db
			.select({ defaultEnvironmentId: agents.defaultEnvironmentId })
			.from(agents)
			.where(eq(agents.id, ctx.agentTurn.agentId))
			.limit(1);
		const rows = await db
			.select({ id: environments.id, name: environments.name })
			.from(environments)
			.where(eq(environments.organizationId, ctx.agentTurn.organizationId))
			.limit(50);
		return rows.map((row) => ({
			...row,
			isDefault: row.id === agent?.defaultEnvironmentId,
		}));
	}),

	...devRoutineTools,
} satisfies TRPCRouterRecord;
