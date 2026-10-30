import { db, dbWs } from "@superset/db/client";
import {
	type AgentTaskRole,
	agentSessions,
	agents,
	agentTurns,
	cloudWorkspacePullRequests,
	cloudWorkspaces,
	environments,
	githubPullRequests,
	type SelectAgentSession,
	tasks,
} from "@superset/db/schema";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { startCloudWorkspace } from "../cloud-workspace/start";
import { insertTask, moveTaskToStarted } from "../task/task";
import { eventText, submitPrompt } from "./turns";

/** Task sessions a Dev runs at once; more wait in its queue. */
export const MAX_RUNNING_TASKS = 3;
const LAUNCH_ATTEMPTS = 2;
const LAUNCH_RETRY_MS = 2_000;

const PULL_REQUEST_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/;

export interface StartTaskInput {
	agentId: string;
	organizationId: string;
	parentSessionId: string;
	requestedByUserId: string | null;
	/** Work on this Paradev task; without it a new task is made from title and instructions. */
	taskId?: string;
	title?: string;
	instructions: string;
	role: AgentTaskRole;
	environmentId?: string;
}

export type StartTaskResult =
	| { taskId: string; sessionId: string; status: "running" | "queued" }
	| { taskId: string; sessionId: string; status: "failed"; error: string }
	| { taskId: string; sessionId: string; status: "duplicate" };

/**
 * Work the main session delegates: a Paradev task, and a task session that
 * works on it on its own box. The session waits in a queue when the Dev
 * already runs its limit. A task has at most one active writer.
 */
export async function startTask(
	input: StartTaskInput,
): Promise<StartTaskResult> {
	const environmentId = await chooseEnvironment(input);
	const taskId = input.taskId
		? await ownedTask(input.organizationId, input.taskId)
		: await newTask(input);
	const [session] = await db
		.insert(agentSessions)
		.values({
			organizationId: input.organizationId,
			agentId: input.agentId,
			kind: "task",
			parentSessionId: input.parentSessionId,
			taskId,
			role: input.role,
			taskStatus: "queued",
			environmentId,
			requestedByUserId: input.requestedByUserId,
			instructions: input.instructions,
		})
		.onConflictDoNothing()
		.returning({ id: agentSessions.id });
	if (!session) {
		const [writer] = await db
			.select({ id: agentSessions.id })
			.from(agentSessions)
			.where(activeWriterOf(taskId))
			.limit(1);
		if (!writer) throw new Error("task session insert conflicted with none");
		return { taskId, sessionId: writer.id, status: "duplicate" };
	}
	const { started, failed } = await fillSlots(input.agentId, session.id);
	const error = failed.get(session.id);
	if (error) return { taskId, sessionId: session.id, status: "failed", error };
	return {
		taskId,
		sessionId: session.id,
		status: started.includes(session.id) ? "running" : "queued",
	};
}

const activeWriterOf = (taskId: string) =>
	and(
		eq(agentSessions.taskId, taskId),
		eq(agentSessions.role, "writer"),
		inArray(agentSessions.taskStatus, ["queued", "running"]),
	);

async function ownedTask(organizationId: string, taskId: string) {
	const [task] = await db
		.select({ id: tasks.id })
		.from(tasks)
		.where(
			and(
				eq(tasks.id, taskId),
				eq(tasks.organizationId, organizationId),
				isNull(tasks.deletedAt),
			),
		)
		.limit(1);
	if (!task) {
		throw userError({
			code: "NOT_FOUND",
			message: "No such task in this organization",
			i18nKey: "serverError.agent.taskNotFound",
		});
	}
	return task.id;
}

async function newTask(input: StartTaskInput): Promise<string> {
	const [agent] = await db
		.select({ createdByUserId: agents.createdByUserId })
		.from(agents)
		.where(eq(agents.id, input.agentId))
		.limit(1);
	const creatorId = input.requestedByUserId ?? agent?.createdByUserId;
	if (!creatorId) throw new Error("no person to own the task");
	const { task } = await insertTask({
		organizationId: input.organizationId,
		creatorId,
		input: {
			title:
				input.title ??
				input.instructions.split("\n")[0]?.slice(0, 120) ??
				"Task",
			description: input.instructions,
			priority: "none",
		},
	});
	if (!task) throw new Error("task insert returned no row");
	return task.id;
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

/** What a task session reads first: the task, and for a reviewer, the work to review. */
async function brief(session: SelectAgentSession): Promise<string> {
	const task = session.taskId ? await taskOf(session.taskId) : null;
	const heading = task ? `Task ${task.slug}: ${task.title}` : "";
	const asked = session.instructions ?? "";
	if (session.role !== "reviewer" || !task) {
		const description =
			task?.description && task.description !== asked
				? `The task's description:\n${task.description}`
				: "";
		return [heading, asked, description].filter(Boolean).join("\n\n");
	}
	const writer = await latestSession(task.id, "writer");
	return [
		heading,
		asked,
		task.prUrl
			? `The pull request to review: ${task.prUrl}`
			: "It has no pull request yet; review what the writer reported.",
		writer?.reply ? `What the writer reported:\n${writer.reply}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
}

async function taskOf(taskId: string) {
	const [task] = await db
		.select({
			id: tasks.id,
			slug: tasks.slug,
			title: tasks.title,
			description: tasks.description,
			prUrl: tasks.prUrl,
		})
		.from(tasks)
		.where(eq(tasks.id, taskId))
		.limit(1);
	return task ?? null;
}

/** A task's newest session in a role, with the reply of its last turn. */
export async function latestSession(taskId: string, role: AgentTaskRole) {
	const [session] = await db
		.select({
			id: agentSessions.id,
			status: agentSessions.taskStatus,
			reply: sql<
				string | null
			>`(select t.reply from ${agentTurns} t where t.session_id = ${agentSessions.id} order by t.started_at desc limit 1)`,
		})
		.from(agentSessions)
		.where(and(eq(agentSessions.taskId, taskId), eq(agentSessions.role, role)))
		.orderBy(desc(agentSessions.createdAt))
		.limit(1);
	return session ?? null;
}

/**
 * Starts queued task sessions, oldest first, until the Dev runs its limit. A
 * session that cannot start is reported to its main session, except
 * `caller`, whose failure the caller returns itself.
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
			await launchWithRetry(next.id);
			started.push(next.id);
		} catch (error) {
			const message = `Could not start: ${error instanceof Error ? error.message : String(error)}`;
			await db
				.update(agentSessions)
				.set({ taskStatus: "failed" })
				.where(eq(agentSessions.id, next.id));
			failed.set(next.id, message);
			if (next.id !== caller) await reportToParent(next.id, null, message);
		}
	}
}

async function launchWithRetry(sessionId: string) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await launchTask(await withUsableBox(sessionId));
		} catch (error) {
			if (attempt >= LAUNCH_ATTEMPTS) throw error;
			await new Promise((resolve) => setTimeout(resolve, LAUNCH_RETRY_MS));
		}
	}
}

/** The session, without a box that failed or was deleted, so a retry makes a new one. */
async function withUsableBox(sessionId: string): Promise<SelectAgentSession> {
	const [row] = await db
		.select({ session: agentSessions, boxStatus: cloudWorkspaces.status })
		.from(agentSessions)
		.leftJoin(
			cloudWorkspaces,
			eq(cloudWorkspaces.id, agentSessions.cloudWorkspaceId),
		)
		.where(eq(agentSessions.id, sessionId))
		.limit(1);
	if (!row) throw new Error("task session is gone");
	if (
		row.session.cloudWorkspaceId &&
		(row.boxStatus === "failed" || row.boxStatus === "deleted")
	) {
		const [cleared] = await db
			.update(agentSessions)
			.set({ cloudWorkspaceId: null })
			.where(eq(agentSessions.id, sessionId))
			.returning();
		if (cleared) return cleared;
	}
	return row.session;
}

async function launchTask(session: SelectAgentSession) {
	const [agent] = await db
		.select()
		.from(agents)
		.where(and(eq(agents.id, session.agentId), isNull(agents.archivedAt)))
		.limit(1);
	if (!agent) throw new Error("Dev is gone");
	const task = session.taskId ? await taskOf(session.taskId) : null;
	const userId = session.requestedByUserId ?? agent.createdByUserId;
	if (!userId) throw new Error("no person to start a box for");
	if (!session.environmentId) throw new Error("task has no environment");
	if (!session.cloudWorkspaceId) {
		await startCloudWorkspace({
			organizationId: session.organizationId,
			userId,
			environmentId: session.environmentId,
			name: `${agent.name}: ${task?.title ?? "task"}`,
			...(task ? { taskIds: [task.id] } : {}),
			beforeProvision: async (workspaceId) => {
				await db
					.update(agentSessions)
					.set({ cloudWorkspaceId: workspaceId })
					.where(eq(agentSessions.id, session.id));
			},
		});
	}
	if (task && session.role === "writer") {
		await dbWs.transaction((tx) =>
			moveTaskToStarted(tx, {
				taskId: task.id,
				organizationId: session.organizationId,
				actorUserId: userId,
			}),
		);
	}
	const [starts] = await db
		.select({ n: count() })
		.from(agentTurns)
		.where(
			and(
				eq(agentTurns.sessionId, session.id),
				eq(agentTurns.reason, "task_start"),
			),
		);
	const start = starts?.n ?? 0;
	await submitPrompt({
		agent,
		sessionId: session.id,
		actingUserId: session.requestedByUserId,
		promptId:
			start === 0
				? `task-start:${session.id}`
				: `task-start:${session.id}:${start + 1}`,
		text: (await brief(session)) || "Start the task.",
		reason: "task_start",
	});
}

/**
 * After a task session's turn settles: record its status and the task's pull
 * request, tell its main session, and start queued work in the slot it
 * freed. Repeat calls for the same turn tell the main session once.
 */
export async function afterTaskTurn(turnId: string) {
	const [row] = await db
		.select({ turn: agentTurns, session: agentSessions })
		.from(agentTurns)
		.innerJoin(agentSessions, eq(agentSessions.id, agentTurns.sessionId))
		.where(eq(agentTurns.id, turnId))
		.limit(1);
	if (!row || row.session.kind !== "task") return;
	const { turn, session } = row;
	if (await relaunchedOnNewBox(session, turn)) return;
	const status =
		turn.status === "completed"
			? "done"
			: turn.status === "interrupted"
				? "stopped"
				: "failed";
	if (session.taskStatus !== "stopped") {
		await db
			.update(agentSessions)
			.set({ taskStatus: status })
			.where(eq(agentSessions.id, session.id));
	}
	if (session.taskId && session.role === "writer") {
		await recordPullRequest(session, turn.reply);
	}
	await reportToParent(session.id, turn.id, turn.reply ?? turn.errorCode);
	await fillSlots(session.agentId);
}

/**
 * A box that never came up fails the session's first turn. That says nothing
 * about the work, so the session goes back in the queue for a new box, once,
 * without telling the main session.
 */
async function relaunchedOnNewBox(
	session: SelectAgentSession,
	turn: typeof agentTurns.$inferSelect,
): Promise<boolean> {
	if (turn.status !== "failed" || turn.reason !== "task_start") return false;
	if (!session.cloudWorkspaceId || session.taskStatus === "stopped")
		return false;
	const [box] = await db
		.select({ status: cloudWorkspaces.status })
		.from(cloudWorkspaces)
		.where(eq(cloudWorkspaces.id, session.cloudWorkspaceId))
		.limit(1);
	if (box?.status !== "failed" && box?.status !== "deleted") return false;
	const [starts] = await db
		.select({ n: count() })
		.from(agentTurns)
		.where(
			and(
				eq(agentTurns.sessionId, session.id),
				eq(agentTurns.reason, "task_start"),
			),
		);
	if ((starts?.n ?? 0) >= LAUNCH_ATTEMPTS) return false;
	await db
		.update(agentSessions)
		.set({ taskStatus: "queued", cloudWorkspaceId: null })
		.where(eq(agentSessions.id, session.id));
	await fillSlots(session.agentId);
	return true;
}

/** The task's pull request: the one its box reported, else the one its writer named. */
async function recordPullRequest(
	session: SelectAgentSession,
	reply: string | null,
) {
	if (!session.taskId) return;
	const [onBox] = session.cloudWorkspaceId
		? await db
				.select({ url: githubPullRequests.url })
				.from(cloudWorkspacePullRequests)
				.innerJoin(
					githubPullRequests,
					and(
						eq(
							githubPullRequests.repositoryId,
							cloudWorkspacePullRequests.repositoryId,
						),
						eq(
							githubPullRequests.prNumber,
							cloudWorkspacePullRequests.prNumber,
						),
					),
				)
				.where(
					eq(
						cloudWorkspacePullRequests.cloudWorkspaceId,
						session.cloudWorkspaceId,
					),
				)
				.orderBy(desc(cloudWorkspacePullRequests.linkedAt))
				.limit(1)
		: [];
	const url = onBox?.url ?? reply?.match(PULL_REQUEST_URL)?.[0];
	if (!url) return;
	await db
		.update(tasks)
		.set({ prUrl: url })
		.where(and(eq(tasks.id, session.taskId), isNull(tasks.prUrl)));
}

async function reportToParent(
	sessionId: string,
	turnId: string | null,
	reported: string | null,
) {
	const [row] = await db
		.select({ session: agentSessions, task: tasks })
		.from(agentSessions)
		.leftJoin(tasks, eq(tasks.id, agentSessions.taskId))
		.where(eq(agentSessions.id, sessionId))
		.limit(1);
	const parentSessionId = row?.session.parentSessionId;
	if (!row || !parentSessionId) return;
	const { session, task } = row;
	const [agent] = await db
		.select({ id: agents.id, organizationId: agents.organizationId })
		.from(agents)
		.where(eq(agents.id, session.agentId))
		.limit(1);
	if (!agent) return;
	const lines = [
		`Task ${task?.slug ?? session.id} (${task?.id ?? "no task"}), ${session.role ?? "writer"} session ${session.id}: ${session.taskStatus}.`,
		task?.prUrl ? `Pull request: ${task.prUrl}` : "",
		reported ? `It reported:\n${reported}` : "It reported nothing.",
	].filter(Boolean);
	await submitPrompt({
		agent,
		sessionId: parentSessionId,
		actingUserId: session.requestedByUserId,
		promptId: `task-update:${turnId ?? session.id}`,
		text: eventText({
			from: `your task: ${task?.title ?? session.id}`,
			where: "a task you started",
			replyTo: null,
			body: lines.join("\n"),
		}),
		reason: "task_update",
	});
}
