import { interruptTurn } from "@superset/agent-harness/session";
import { db } from "@superset/db/client";
import {
	agentMemories,
	agentSessions,
	agents,
	agentTaskRoleEnum,
	channels,
	environments,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { agentTemporal } from "../../lib/agent-runtime";
import { agentProcedure } from "../../trpc";
import { channelNotFound } from "../channel/access";
import { postAgentMessage } from "../channel/channel-message";
import { fillSlots, startTask } from "./tasks";
import { submitPrompt } from "./turns";

const TARGET = /^channel:([0-9a-f-]{36})(?:\/thread:([0-9a-f-]{36}))?$/;
const MAX_MEMORIES = 50;

/** Only a Dev's main session delegates and speaks; its tasks report back instead. */
const mainProcedure = agentProcedure.use(async ({ ctx, next }) => {
	const [session] = await db
		.select({ kind: agentSessions.kind })
		.from(agentSessions)
		.where(eq(agentSessions.id, ctx.agentTurn.sessionId))
		.limit(1);
	if (session?.kind !== "main") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only a Dev's main session can use this tool.",
		});
	}
	return next();
});

const taskNotFound = () =>
	new TRPCError({ code: "NOT_FOUND", message: "No such task." });

async function ownTask(agentId: string, taskId: string) {
	const [task] = await db
		.select()
		.from(agentSessions)
		.where(
			and(
				eq(agentSessions.id, taskId),
				eq(agentSessions.agentId, agentId),
				eq(agentSessions.kind, "task"),
			),
		)
		.limit(1);
	if (!task) throw taskNotFound();
	return task;
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
				target: z.string().regex(TARGET),
				body: z.string().min(1).max(40_000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [, channelId, threadRootId] = input.target.match(TARGET) ?? [];
			if (!channelId) throw channelNotFound();
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
				threadRootId: threadRootId ?? null,
			});
			return { messageId: message.id };
		}),

	listWork: mainProcedure.query(async ({ ctx }) => {
		const tasks = await db
			.select({
				id: agentSessions.id,
				title: agentSessions.title,
				role: agentSessions.role,
				status: agentSessions.taskStatus,
				pullRequestUrl: agentSessions.pullRequestUrl,
				updatedAt: agentSessions.lastActivityAt,
				result: agentSessions.result,
			})
			.from(agentSessions)
			.where(
				and(
					eq(agentSessions.agentId, ctx.agentTurn.agentId),
					eq(agentSessions.kind, "task"),
				),
			)
			.orderBy(desc(agentSessions.createdAt))
			.limit(30);
		return tasks.map(({ result, ...task }) => ({
			...task,
			summary: result ? result.slice(0, 400) : null,
		}));
	}),

	readTask: mainProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const task = await ownTask(ctx.agentTurn.agentId, input.taskId);
			return {
				id: task.id,
				title: task.title,
				role: task.role,
				status: task.taskStatus,
				pullRequestUrl: task.pullRequestUrl,
				cloudWorkspaceId: task.cloudWorkspaceId,
				result: task.result,
			};
		}),

	startTask: mainProcedure
		.input(
			z.object({
				title: z.string().min(1).max(200),
				instructions: z.string().min(1).max(20_000),
				role: agentTaskRoleEnum.default("writer"),
				environmentId: z.string().uuid().optional(),
				dedupeKey: z.string().min(1).max(300).optional(),
				reviewOfTaskId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.reviewOfTaskId) {
				await ownTask(ctx.agentTurn.agentId, input.reviewOfTaskId);
			}
			return startTask({
				agentId: ctx.agentTurn.agentId,
				organizationId: ctx.agentTurn.organizationId,
				parentSessionId: ctx.agentTurn.sessionId,
				requestedByUserId: ctx.agentTurn.actingUserId,
				...input,
			});
		}),

	messageTask: mainProcedure
		.input(
			z.object({
				taskId: z.string().uuid(),
				text: z.string().min(1).max(20_000),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const task = await ownTask(ctx.agentTurn.agentId, input.taskId);
			if (task.taskStatus === "queued") {
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
				.where(eq(agentSessions.id, task.id));
			const outcome = await submitPrompt({
				agent,
				sessionId: task.id,
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
			const task = await ownTask(ctx.agentTurn.agentId, input.taskId);
			await db
				.update(agentSessions)
				.set({ taskStatus: "stopped" })
				.where(eq(agentSessions.id, task.id));
			if (task.taskStatus === "running") {
				await interruptTurn(await agentTemporal(), task.id).catch(() => {});
			}
			await fillSlots(ctx.agentTurn.agentId);
			return { stopped: true };
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
} satisfies TRPCRouterRecord;
