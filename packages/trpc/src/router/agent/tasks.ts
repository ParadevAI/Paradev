import { db } from "@superset/db/client";
import {
	type AgentTaskRole,
	agentSessions,
	agents,
	agentTurns,
	environments,
	type SelectAgentSession,
} from "@superset/db/schema";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { startCloudWorkspace } from "../cloud-workspace/start";
import { eventText, submitPrompt } from "./turns";

/** Tasks a Dev runs at once; more wait in its queue. */
export const MAX_RUNNING_TASKS = 3;

const PULL_REQUEST_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/;

export interface StartTaskInput {
	agentId: string;
	organizationId: string;
	parentSessionId: string;
	requestedByUserId: string | null;
	title: string;
	instructions: string;
	role: AgentTaskRole;
	environmentId?: string;
	dedupeKey?: string;
	reviewOfTaskId?: string;
}

export type StartTaskResult =
	| { taskId: string; status: "running" | "queued" }
	| { taskId: string; status: "failed"; error: string }
	| { taskId: string; status: "duplicate"; title: string | null };

/**
 * A task the main session delegates. It runs on its own box, unless the Dev
 * already runs its limit, in which case it waits. A task for a dedupe key
 * that is already queued or running is refused with that task's id.
 */
export async function startTask(
	input: StartTaskInput,
): Promise<StartTaskResult> {
	const environmentId = await chooseEnvironment(input);
	const brief = await taskBrief(input);
	const [task] = await db
		.insert(agentSessions)
		.values({
			organizationId: input.organizationId,
			agentId: input.agentId,
			kind: "task",
			parentSessionId: input.parentSessionId,
			title: input.title,
			role: input.role,
			taskStatus: "queued",
			dedupeKey: input.dedupeKey ?? null,
			environmentId,
			requestedByUserId: input.requestedByUserId,
			instructions: brief,
		})
		.onConflictDoNothing()
		.returning();
	if (!task) {
		const [existing] = await db
			.select({ id: agentSessions.id, title: agentSessions.title })
			.from(agentSessions)
			.where(
				and(
					eq(agentSessions.agentId, input.agentId),
					eq(agentSessions.dedupeKey, input.dedupeKey ?? ""),
				),
			)
			.orderBy(asc(agentSessions.createdAt))
			.limit(1);
		if (!existing) throw new Error("task insert conflicted with no task");
		return { taskId: existing.id, status: "duplicate", title: existing.title };
	}
	const { started, failed } = await fillSlots(input.agentId, task.id);
	const error = failed.get(task.id);
	if (error) return { taskId: task.id, status: "failed", error };
	return {
		taskId: task.id,
		status: started.includes(task.id) ? "running" : "queued",
	};
}

async function chooseEnvironment(input: StartTaskInput): Promise<string> {
	if (input.environmentId) {
		const [owned] = await db
			.select({ id: environments.id })
			.from(environments)
			.where(
				and(
					eq(environments.id, input.environmentId),
					eq(environments.organizationId, input.organizationId),
				),
			)
			.limit(1);
		if (!owned) throw environmentRequired();
		return owned.id;
	}
	const [agent] = await db
		.select({ defaultEnvironmentId: agents.defaultEnvironmentId })
		.from(agents)
		.where(eq(agents.id, input.agentId))
		.limit(1);
	if (agent?.defaultEnvironmentId) return agent.defaultEnvironmentId;
	const usable = await db
		.select({ id: environments.id })
		.from(environments)
		.where(eq(environments.organizationId, input.organizationId))
		.limit(2);
	if (usable.length === 1 && usable[0]) return usable[0].id;
	throw environmentRequired();
}

const environmentRequired = () =>
	userError({
		code: "BAD_REQUEST",
		message:
			"Choose an environment for this task: call list_environments and pass its id",
		i18nKey: "serverError.agent.taskEnvironmentRequired",
	});

async function taskBrief(input: StartTaskInput): Promise<string> {
	if (input.role !== "reviewer" || !input.reviewOfTaskId) {
		return input.instructions;
	}
	const [writer] = await db
		.select()
		.from(agentSessions)
		.where(
			and(
				eq(agentSessions.id, input.reviewOfTaskId),
				eq(agentSessions.agentId, input.agentId),
			),
		)
		.limit(1);
	if (!writer) return input.instructions;
	return [
		input.instructions,
		`The work to review is task "${writer.title ?? writer.id}".`,
		writer.pullRequestUrl
			? `Its pull request: ${writer.pullRequestUrl}`
			: "It has no pull request yet; review what its result describes.",
		writer.result ? `What the writer reported:\n${writer.result}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Starts queued tasks, oldest first, until the Dev runs its limit. A task that
 * cannot start is reported to its main session, except `caller`, whose
 * failure the caller returns itself.
 */
export async function fillSlots(
	agentId: string,
	caller?: string,
): Promise<{ started: string[]; failed: Map<string, string> }> {
	const started: string[] = [];
	const failed = new Map<string, string>();
	for (;;) {
		const [running] = await db
			.select({ n: count() })
			.from(agentSessions)
			.where(
				and(
					eq(agentSessions.agentId, agentId),
					eq(agentSessions.kind, "task"),
					eq(agentSessions.taskStatus, "running"),
				),
			);
		if ((running?.n ?? 0) >= MAX_RUNNING_TASKS) return { started, failed };
		const [next] = await db
			.update(agentSessions)
			.set({ taskStatus: "running" })
			.where(
				eq(
					agentSessions.id,
					db
						.select({ id: agentSessions.id })
						.from(agentSessions)
						.where(
							and(
								eq(agentSessions.agentId, agentId),
								eq(agentSessions.kind, "task"),
								eq(agentSessions.taskStatus, "queued"),
							),
						)
						.orderBy(asc(agentSessions.createdAt))
						.limit(1),
				),
			)
			.returning();
		if (!next) return { started, failed };
		try {
			await launchTask(next);
			started.push(next.id);
		} catch (error) {
			const result = `Could not start: ${error instanceof Error ? error.message : String(error)}`;
			await db
				.update(agentSessions)
				.set({ taskStatus: "failed", result })
				.where(eq(agentSessions.id, next.id));
			failed.set(next.id, result);
			if (next.id !== caller) await reportToParent(next.id, null);
		}
	}
}

async function launchTask(task: SelectAgentSession) {
	const [agent] = await db
		.select()
		.from(agents)
		.where(and(eq(agents.id, task.agentId), isNull(agents.archivedAt)))
		.limit(1);
	if (!agent) throw new Error("Dev is gone");
	const userId = task.requestedByUserId ?? agent.createdByUserId;
	if (!userId) throw new Error("no person to start a box for");
	if (!task.environmentId) throw new Error("task has no environment");
	if (!task.cloudWorkspaceId) {
		await startCloudWorkspace({
			organizationId: task.organizationId,
			userId,
			environmentId: task.environmentId,
			name: `${agent.name}: ${task.title ?? "task"}`,
			beforeProvision: async (workspaceId) => {
				await db
					.update(agentSessions)
					.set({ cloudWorkspaceId: workspaceId })
					.where(eq(agentSessions.id, task.id));
			},
		});
	}
	await submitPrompt({
		agent,
		sessionId: task.id,
		actingUserId: task.requestedByUserId,
		promptId: `task-start:${task.id}`,
		text: task.instructions ?? task.title ?? "Start the task.",
		reason: "task_start",
	});
}

/**
 * After a task's turn settles: record its status, result and pull request,
 * tell its main session, and start queued work in the slot it freed.
 * Repeat calls for the same turn tell the main session once.
 */
export async function afterTaskTurn(turnId: string) {
	const [row] = await db
		.select({ turn: agentTurns, task: agentSessions })
		.from(agentTurns)
		.innerJoin(agentSessions, eq(agentSessions.id, agentTurns.sessionId))
		.where(eq(agentTurns.id, turnId))
		.limit(1);
	if (!row || row.task.kind !== "task") return;
	const { turn, task } = row;
	const status =
		turn.status === "completed"
			? "done"
			: turn.status === "interrupted"
				? "stopped"
				: "failed";
	const pullRequestUrl =
		turn.reply?.match(PULL_REQUEST_URL)?.[0] ?? task.pullRequestUrl;
	if (task.taskStatus !== "stopped") {
		await db
			.update(agentSessions)
			.set({
				taskStatus: status,
				result: turn.reply ?? turn.errorCode ?? task.result,
				pullRequestUrl,
			})
			.where(eq(agentSessions.id, task.id));
	}
	await reportToParent(task.id, turn.id);
	await fillSlots(task.agentId);
}

async function reportToParent(taskId: string, turnId: string | null) {
	const [task] = await db
		.select()
		.from(agentSessions)
		.where(eq(agentSessions.id, taskId))
		.limit(1);
	if (!task?.parentSessionId) return;
	const [agent] = await db
		.select({ id: agents.id, organizationId: agents.organizationId })
		.from(agents)
		.where(eq(agents.id, task.agentId))
		.limit(1);
	if (!agent) return;
	const lines = [
		`Task ${task.id} (${task.role ?? "writer"}): ${task.taskStatus}.`,
		task.pullRequestUrl ? `Pull request: ${task.pullRequestUrl}` : "",
		task.result ? `It reported:\n${task.result}` : "It reported nothing.",
	].filter(Boolean);
	await submitPrompt({
		agent,
		sessionId: task.parentSessionId,
		actingUserId: task.requestedByUserId,
		promptId: `task-update:${turnId ?? task.id}`,
		text: eventText({
			from: `your task: ${task.title ?? task.id}`,
			where: "a task you started",
			replyTo: null,
			body: lines.join("\n"),
		}),
		reason: "task_update",
	});
}
