import {
	statusActivityKind,
	type TaskActivity,
	type TaskActivityKind,
	type TaskStatus,
} from "@superset/chats-core";
import type { ApiTask } from "@superset/chats-sync";
import { db } from "@superset/db/client";
import {
	chatsTaskNotes,
	chatsTasks,
	taskStatuses,
	tasks,
} from "@superset/db/schema";
import { chatsGroupChannel } from "@superset/shared/chats-realtime";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordTaskActivity } from "../../task/activity";
import { publishChats } from "../publish";

type TaskRow = typeof tasks.$inferSelect;
type ChatTaskRow = typeof chatsTasks.$inferSelect;
type NoteRow = typeof chatsTaskNotes.$inferSelect;

/** A chat task: the task, what the chat adds to it, and its status as chats read it. */
export interface ChatTask {
	task: TaskRow;
	chat: ChatTaskRow;
	status: TaskStatus;
	/** Whose status set the task is in: null for Paradev's own, else the provider's. */
	statusProvider: string | null;
}

/** Who did something to a task. A Dev acts for the person its turn is for. */
export type TaskActor =
	| { kind: "user"; userId: string }
	| { kind: "dev"; agentId: string; userId: string | null; turnId?: string };

const STATUS_BY_TYPE: Record<string, TaskStatus> = {
	started: "in_progress",
	completed: "done",
	canceled: "done",
};

/** The status types a chat status may be stored as, the first that exists wins. */
const TYPES_BY_STATUS: Record<TaskStatus, string[]> = {
	todo: ["unstarted", "backlog"],
	in_progress: ["started"],
	done: ["completed"],
};

/** `chats.tasks` under its own name: joined to `tasks`, the bare table name is ambiguous. */
export const chatTask = alias(chatsTasks, "chat_task");

const selectTasks = () =>
	db
		.select({
			task: tasks,
			chat: chatTask,
			statusType: taskStatuses.type,
			statusProvider: taskStatuses.externalProvider,
		})
		.from(chatTask)
		.innerJoin(tasks, eq(tasks.id, chatTask.taskId))
		.innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId));

type Selected = Awaited<ReturnType<typeof selectTasks>>[number];

const toChatTask = (row: Selected): ChatTask => ({
	task: row.task,
	chat: row.chat,
	status: STATUS_BY_TYPE[row.statusType] ?? "todo",
	statusProvider: row.statusProvider,
});

export async function findChatTask(taskId: string): Promise<ChatTask | null> {
	const [row] = await selectTasks().where(
		and(eq(chatTask.taskId, taskId), isNull(tasks.deletedAt)),
	);
	return row ? toChatTask(row) : null;
}

export async function chatTasksByIds(taskIds: string[]): Promise<ChatTask[]> {
	if (taskIds.length === 0) return [];
	const rows = await selectTasks().where(
		and(inArray(chatTask.taskId, taskIds), isNull(tasks.deletedAt)),
	);
	return rows.map(toChatTask);
}

/** Every task of the chats, newest first. */
export async function chatTasksOfGroups(
	groupIds: string[],
): Promise<ChatTask[]> {
	if (groupIds.length === 0) return [];
	const rows = await selectTasks()
		.where(and(inArray(chatTask.groupId, groupIds), isNull(tasks.deletedAt)))
		.orderBy(desc(tasks.createdAt));
	return rows.map(toChatTask);
}

export const taskView = ({ task, chat, status }: ChatTask): ApiTask => ({
	id: task.id,
	groupId: chat.groupId,
	title: task.title,
	description: task.description ?? "",
	status,
	assigneeId: chat.assigneeAgentId ? null : task.assigneeId,
	assigneeDevId: chat.assigneeAgentId,
	due: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
	scheduledAt: chat.scheduledAt?.toISOString() ?? null,
	remind: chat.remind,
	labels: [],
	repeat: null,
	createdBy: chat.createdByAgentId ? null : task.creatorId,
	createdByDevId: chat.createdByAgentId,
	createdAt: task.createdAt.toISOString(),
	startedAt: task.startedAt?.toISOString() ?? null,
	completedAt: task.completedAt?.toISOString() ?? null,
});

export const noteView = (note: NoteRow): TaskActivity => ({
	id: note.id,
	taskId: note.taskId,
	kind: note.kind,
	text: note.text,
	actor: note.agentId
		? { kind: "dev", id: note.agentId }
		: note.userId
			? { kind: "user", id: note.userId }
			: null,
	at: note.createdAt.toISOString(),
});

/** A task's timeline, oldest first. */
export async function taskNotes(taskId: string): Promise<TaskActivity[]> {
	const rows = await db
		.select()
		.from(chatsTaskNotes)
		.where(eq(chatsTaskNotes.taskId, taskId))
		.orderBy(asc(chatsTaskNotes.createdAt), asc(chatsTaskNotes.id));
	return rows.map(noteView);
}

/** Adds entries to a task's timeline and tells the chat. `actor` null: the system did it. */
export async function addNotes(
	found: Pick<ChatTask, "task" | "chat">,
	actor: TaskActor | null,
	entries: { kind: TaskActivityKind; text?: string }[],
): Promise<TaskActivity[]> {
	if (entries.length === 0) return [];
	const rows = await db
		.insert(chatsTaskNotes)
		.values(
			entries.map((entry) => ({
				taskId: found.task.id,
				kind: entry.kind,
				text: entry.text ?? "",
				userId: actor?.kind === "user" ? actor.userId : null,
				agentId: actor?.kind === "dev" ? actor.agentId : null,
			})),
		)
		.returning();
	const notes = rows.map(noteView);
	for (const activity of notes) {
		publishChats(chatsGroupChannel(found.chat.groupId), {
			type: "task.activity",
			groupId: found.chat.groupId,
			activity,
		});
	}
	return notes;
}

/** Tells the chat a task changed, and returns it as the chat reads it. */
export async function publishTask(taskId: string): Promise<ApiTask | null> {
	const found = await findChatTask(taskId);
	if (!found) return null;
	const task = taskView(found);
	publishChats(chatsGroupChannel(found.chat.groupId), {
		type: "task.updated",
		task,
	});
	return task;
}

/**
 * Moves a task to a chat status, within the status set it is already in, and
 * logs the move on both timelines. False when nothing moved: it was already
 * there, or its status set has no such status.
 */
export async function setTaskStatus(
	found: ChatTask,
	to: TaskStatus,
	actor: TaskActor | null,
	note?: { kind: TaskActivityKind; text?: string },
): Promise<boolean> {
	if (found.status === to) return false;
	const candidates = await db
		.select({ id: taskStatuses.id, type: taskStatuses.type })
		.from(taskStatuses)
		.where(
			and(
				eq(taskStatuses.organizationId, found.task.organizationId),
				inArray(taskStatuses.type, TYPES_BY_STATUS[to]),
				found.statusProvider
					? eq(
							taskStatuses.externalProvider,
							found.statusProvider as NonNullable<
								(typeof taskStatuses.$inferSelect)["externalProvider"]
							>,
						)
					: isNull(taskStatuses.externalProvider),
			),
		)
		.orderBy(asc(taskStatuses.position));
	const status = TYPES_BY_STATUS[to]
		.map((type) => candidates.find((candidate) => candidate.type === type))
		.find((candidate) => candidate !== undefined);
	if (!status) return false;
	const now = new Date();
	const moved = await db
		.update(tasks)
		.set({
			statusId: status.id,
			...(to === "in_progress" && !found.task.startedAt
				? { startedAt: now }
				: {}),
			completedAt: to === "done" ? now : null,
		})
		.where(
			and(eq(tasks.id, found.task.id), eq(tasks.statusId, found.task.statusId)),
		)
		.returning({ id: tasks.id });
	if (moved.length === 0) return false;
	await recordTaskActivity(
		db,
		found.task.id,
		actor?.userId ? { kind: "user", userId: actor.userId } : { kind: "system" },
		[{ fromStatusId: found.task.statusId, toStatusId: status.id }],
	);
	await addNotes(found, actor, [
		note ?? { kind: statusActivityKind(found.status, to), text: to },
	]);
	return true;
}
