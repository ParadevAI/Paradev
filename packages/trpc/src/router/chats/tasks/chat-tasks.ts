import {
	canMoveTask,
	mentionToken,
	ownedByGroup,
	parseMentionTokens,
	type TaskActivity,
	type TaskActivityKind,
} from "@superset/chats-core";
import type { ApiMessage, ApiTask } from "@superset/chats-sync";
import { db } from "@superset/db/client";
import {
	chatsAgents,
	chatsGroupAgents,
	chatsGroupMembers,
	chatsGroups,
	chatsMessages,
	chatsTaskNotes,
	chatsTasks,
	chatsTurns,
	tasks,
	users,
} from "@superset/db/schema";
import { chatsGroupChannel } from "@superset/shared/chats-realtime";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { recordTaskActivity } from "../../task/activity";
import { insertTask } from "../../task/task";
import { publishChats } from "../publish";
import { enqueueTaskTurn, type TurnDeps } from "../turns/engine";
import { loadRoster, type RosterDev } from "../turns/roster";
import { formatTime, turnHeader } from "../turns/turn-header";
import { messageView, toUser } from "../views";
import {
	addNotes,
	type ChatTask,
	chatTask,
	findChatTask,
	publishTask,
	setTaskStatus,
	type TaskActor,
	taskNotes,
	taskView,
} from "./task-store";

export class TaskError extends Error {
	constructor(
		readonly status: 400 | 403 | 404 | 409,
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

const NO_REPEAT = "Repeating tasks aren't available yet";

const taskFields = {
	description: z.string().max(20_000).optional(),
	assignee: z.string().max(200).nullable().optional(),
	due: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "A due date is YYYY-MM-DD")
		.nullable()
		.optional(),
	scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
	remind: z.boolean().optional(),
	repeat: z.null({ message: NO_REPEAT }).optional(),
};

export const taskInputSchema = z.object({
	title: z.string().trim().min(1).max(500),
	...taskFields,
});

export const taskPatchSchema = z.object({
	title: z.string().trim().min(1).max(500).optional(),
	status: z.enum(["todo", "in_progress", "needs_review", "done"]).optional(),
	...taskFields,
});

export type TaskInput = z.output<typeof taskInputSchema>;
export type TaskPatchInput = z.output<typeof taskPatchSchema>;

/** One actor's edits to the same field within this long read as one edit. */
const EDIT_FOLD_MS = 10 * 60_000;
/** `setTimeout` takes at most 2^31 ms; a later run checks again when this one wakes. */
const TIMER_MAX_MS = 2 ** 31 - 1;

type GroupRow = typeof chatsGroups.$inferSelect;
type Assignee = { userId: string } | { agentId: string } | null;

interface Chat {
	group: GroupRow;
	roster: RosterDev[];
	people: { id: string; name: string }[];
}

async function loadChat(groupId: string): Promise<Chat> {
	const [[group], roster, people] = await Promise.all([
		db.select().from(chatsGroups).where(eq(chatsGroups.id, groupId)),
		loadRoster(groupId),
		db
			.select({ user: users })
			.from(chatsGroupMembers)
			.innerJoin(users, eq(users.id, chatsGroupMembers.userId))
			.where(eq(chatsGroupMembers.groupId, groupId)),
	]);
	if (!group) throw new TaskError(404, "not_found", "Chat not found");
	return {
		group,
		roster,
		people: people.map(({ user }) => ({
			id: user.id,
			name: toUser(user).displayName,
		})),
	};
}

/**
 * A person acts on the tasks of chats they are in. A Dev acts in the chats
 * it is in, and in its owner's chats when the owner asked it.
 */
function assertActorIn(actor: TaskActor, chat: Chat) {
	const isMember = (userId: string | null) =>
		userId !== null && chat.people.some((person) => person.id === userId);
	if (actor.kind === "user") {
		if (!isMember(actor.userId)) {
			throw new TaskError(404, "not_found", "Chat not found");
		}
		return;
	}
	if (chat.roster.some((dev) => dev.id === actor.agentId)) return;
	if (!isMember(actor.userId)) {
		throw new TaskError(403, "forbidden", "This Dev isn't in that chat");
	}
}

function resolveAssignee(
	value: string | null,
	actor: TaskActor,
	chat: Chat,
): Assignee {
	const text = value?.trim() ?? "";
	if (!text || text.toLowerCase() === "none") return null;
	if (text.toLowerCase() === "me") {
		return actor.kind === "user"
			? { userId: actor.userId }
			: { agentId: actor.agentId };
	}
	const [token] = parseMentionTokens(text);
	const id = token?.id ?? (z.string().uuid().safeParse(text).data || null);
	if (id) {
		if (chat.people.some((person) => person.id === id)) return { userId: id };
		if (chat.roster.some((dev) => dev.id === id)) return { agentId: id };
		throw new TaskError(400, "invalid", "That assignee isn't in this chat");
	}
	const name = text.replace(/^@/, "").toLowerCase();
	const person = chat.people.find((candidate) =>
		candidate.name.toLowerCase().startsWith(name),
	);
	if (person) return { userId: person.id };
	const devs = chat.roster.filter((dev) => dev.name.toLowerCase() === name);
	const [dev] = devs;
	if (devs.length > 1) {
		throw new TaskError(
			409,
			"ambiguous",
			`Several Devs here are named ${text}; use the Dev's id`,
		);
	}
	if (!dev) {
		throw new TaskError(400, "invalid", `Nobody here is named ${text}`);
	}
	return { agentId: dev.id };
}

/** A member's own Dev takes work only from its owner, or from itself. */
function assertAssignable(assignee: Assignee, actor: TaskActor, chat: Chat) {
	if (!assignee || !("agentId" in assignee)) return;
	const dev = chat.roster.find((entry) => entry.id === assignee.agentId);
	if (!dev) throw new TaskError(400, "invalid", "That Dev isn't in this chat");
	if (chat.group.kind === "direct" || ownedByGroup(dev)) return;
	const own =
		actor.kind === "user"
			? dev.ownerUserId === actor.userId
			: actor.agentId === dev.id;
	if (!own) {
		throw new TaskError(
			403,
			"forbidden",
			"Only its owner can give work to a member's Dev",
		);
	}
}

const dueDate = (due: string | null | undefined) =>
	due ? new Date(`${due}T00:00:00Z`) : null;

/** When an agent starts a task due on a date with no time: that morning, in UTC. */
const dayStart = (date: Date) =>
	new Date(`${date.toISOString().slice(0, 10)}T09:00:00Z`);

const runAt = ({ task, chat }: ChatTask) =>
	chat.scheduledAt ??
	(chat.assigneeAgentId && task.dueDate ? dayStart(task.dueDate) : null);

const held = globalThis as typeof globalThis & {
	__chatsTaskTimers?: Map<string, ReturnType<typeof setTimeout>>;
};
held.__chatsTaskTimers ??= new Map();
const timers = held.__chatsTaskTimers;

function cancelRun(taskId: string) {
	const timer = timers.get(taskId);
	if (timer) clearTimeout(timer);
	timers.delete(taskId);
}

function scheduleRun(
	deps: TurnDeps,
	taskId: string,
	version: number,
	at: Date,
) {
	cancelRun(taskId);
	const wait = Math.min(Math.max(at.getTime() - Date.now(), 0), TIMER_MAX_MS);
	const timer = setTimeout(() => {
		timers.delete(taskId);
		fireTask(deps, taskId, version).catch((error: unknown) =>
			console.error(`[chats] task ${taskId} did not fire:`, error),
		);
	}, wait);
	(timer as { unref?: () => void }).unref?.();
	timers.set(taskId, timer);
}

/** The task's Dev gets to work in the task's chat, if it is still there. False when it can't. */
async function startTaskWork(deps: TurnDeps, found: ChatTask) {
	const agentId = found.chat.assigneeAgentId;
	if (!agentId) return false;
	const [link] = await db
		.select({ agentId: chatsGroupAgents.agentId })
		.from(chatsGroupAgents)
		.where(
			and(
				eq(chatsGroupAgents.groupId, found.chat.groupId),
				eq(chatsGroupAgents.agentId, agentId),
			),
		);
	if (!link) {
		await addNotes(found, null, [
			{ kind: "failed", text: "Its Dev isn't in this chat anymore" },
		]);
		return false;
	}
	await enqueueTaskTurn(deps, {
		agentId,
		groupId: found.chat.groupId,
		taskId: found.task.id,
		userId: found.task.creatorId,
	});
	return true;
}

/** "Reminder: <title>" in the task's chat with its card, mentioning who it is for. Once per `key`. */
async function remind(found: ChatTask, key: string) {
	const who = found.task.assigneeId ?? found.task.creatorId;
	const [message] = await db
		.insert(chatsMessages)
		.values({
			groupId: found.chat.groupId,
			text: `Reminder: ${found.task.title} ${mentionToken({ kind: "user", id: who })}`,
			taskId: found.task.id,
			clientId: `reminder:${key}`,
		})
		.onConflictDoNothing()
		.returning();
	if (!message) return;
	publishChats(chatsGroupChannel(found.chat.groupId), {
		type: "message.created",
		message: await messageView(message),
		task: taskView(found),
	});
	await addNotes(found, null, [{ kind: "reminded" }]);
}

/**
 * What a task needs after it is made or its who or when changed: a Dev
 * starts now unless the task has a later time, and a later time gets a run
 * that wakes then. Where nothing runs Devs, nothing is armed.
 */
export async function armTask(deps: TurnDeps | null, taskId: string) {
	if (!deps) return;
	const found = await findChatTask(taskId);
	if (!found || found.chat.seriesId || found.status === "done") return;
	const at = runAt(found);
	const later = at && at.getTime() > Date.now() ? at : null;
	if (found.chat.assigneeAgentId && found.status === "todo" && !later) {
		await startTaskWork(deps, found);
	}
	if (later) scheduleRun(deps, taskId, found.chat.scheduleVersion, later);
}

/** A task's time has come. Does nothing when the task changed since the run was armed. */
export async function fireTask(
	deps: TurnDeps,
	taskId: string,
	version: number,
	now: Date = new Date(),
) {
	const found = await findChatTask(taskId);
	if (
		!found ||
		found.chat.scheduleVersion !== version ||
		found.status === "done" ||
		found.chat.seriesId
	) {
		return;
	}
	const at = runAt(found);
	if (at && at.getTime() > now.getTime()) {
		scheduleRun(deps, taskId, version, at);
		return;
	}
	const key = `${taskId}:${version}`;
	if (!found.chat.assigneeAgentId) return remind(found, key);
	if (!(found.chat.remind && found.chat.scheduledAt)) {
		if (found.status === "todo") await startTaskWork(deps, found);
		return;
	}
	if (!(await startTaskWork(deps, found))) return remind(found, key);
	await db
		.update(chatsTasks)
		.set({ scheduleVersion: version + 1 })
		.where(
			and(
				eq(chatsTasks.taskId, taskId),
				eq(chatsTasks.scheduleVersion, version),
			),
		);
}

/** After a restart: every task with a time still to come gets its run again. */
export async function rearmTasks(deps: TurnDeps) {
	const rows = await db
		.select({ taskId: chatTask.taskId })
		.from(chatTask)
		.innerJoin(tasks, eq(tasks.id, chatTask.taskId))
		.where(
			and(
				isNull(tasks.deletedAt),
				isNull(tasks.completedAt),
				isNotNull(chatTask.scheduledAt),
				gt(chatTask.scheduledAt, new Date()),
			),
		);
	for (const row of rows) await armTask(deps, row.taskId);
}

async function creatorOf(actor: TaskActor, chat: Chat): Promise<string> {
	if (actor.kind === "user") return actor.userId;
	if (actor.userId) return actor.userId;
	const dev = chat.roster.find((entry) => entry.id === actor.agentId);
	const fallback =
		dev?.ownerUserId ?? chat.group.createdBy ?? chat.people[0]?.id;
	if (!fallback)
		throw new TaskError(409, "no_people", "Nobody is in this chat");
	return fallback;
}

export interface TaskCard {
	message: ApiMessage;
	task: ApiTask | null;
}

/**
 * A task in a chat, with the message that carries its card. A person's task
 * in a 1:1 with no assignee is the chat's Dev's.
 */
export async function createChatTask(
	deps: TurnDeps | null,
	actor: TaskActor,
	groupId: string,
	input: TaskInput,
	options: { messageText?: string; clientId?: string } = {},
): Promise<TaskCard> {
	const chat = await loadChat(groupId);
	assertActorIn(actor, chat);
	if (options.clientId) {
		const [sent] = await db
			.select()
			.from(chatsMessages)
			.where(
				and(
					eq(chatsMessages.groupId, groupId),
					eq(chatsMessages.clientId, options.clientId),
				),
			);
		if (sent) {
			const existing = sent.taskId ? await findChatTask(sent.taskId) : null;
			return {
				message: await messageView(sent),
				task: existing ? taskView(existing) : null,
			};
		}
	}
	const [chatDev] = chat.roster;
	const assignee =
		input.assignee != null
			? resolveAssignee(input.assignee, actor, chat)
			: actor.kind === "user" && chat.group.kind === "direct" && chatDev
				? { agentId: chatDev.id }
				: null;
	assertAssignable(assignee, actor, chat);
	const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
	const { task } = await insertTask({
		organizationId: chat.group.organizationId,
		creatorId: await creatorOf(actor, chat),
		input: {
			title: input.title,
			description: input.description || null,
			priority: "none",
			assigneeId: assignee && "userId" in assignee ? assignee.userId : null,
			dueDate: scheduledAt ? null : dueDate(input.due),
		},
	});
	if (!task) throw new Error("The task was not stored");
	try {
		await db.insert(chatsTasks).values({
			taskId: task.id,
			groupId,
			assigneeAgentId:
				assignee && "agentId" in assignee ? assignee.agentId : null,
			createdByAgentId: actor.kind === "dev" ? actor.agentId : null,
			scheduledAt,
			remind: input.remind ?? false,
		});
	} catch (error) {
		await db
			.update(tasks)
			.set({ deletedAt: new Date() })
			.where(eq(tasks.id, task.id));
		throw error;
	}
	const [message] = await db
		.insert(chatsMessages)
		.values({
			groupId,
			authorId: actor.kind === "user" ? actor.userId : null,
			authorAgentId: actor.kind === "dev" ? actor.agentId : null,
			turnId: actor.kind === "dev" ? (actor.turnId ?? null) : null,
			text: options.messageText ?? `Added a task: ${input.title}`,
			taskId: task.id,
			clientId: options.clientId,
		})
		.returning();
	const found = await findChatTask(task.id);
	if (!message || !found) throw new Error("The task's card was not stored");
	const assigneeId =
		assignee && ("userId" in assignee ? assignee.userId : assignee.agentId);
	await addNotes(found, actor, [
		{ kind: "created" },
		...(assigneeId ? [{ kind: "assigned" as const, text: assigneeId }] : []),
		...(scheduledAt
			? [{ kind: "scheduled" as const, text: scheduledAt.toISOString() }]
			: []),
	]);
	const card = { message: await messageView(message), task: taskView(found) };
	publishChats(chatsGroupChannel(groupId), {
		type: "message.created",
		...card,
	});
	await armTask(deps, task.id);
	return card;
}

/**
 * An organization task that was made outside the chats, brought into a chat:
 * the task keeps its title, status, assignee and due date, and gets a card.
 */
export async function importChatTask(
	actor: TaskActor,
	groupId: string,
	taskId: string,
	options: { clientId?: string } = {},
): Promise<TaskCard> {
	const chat = await loadChat(groupId);
	assertActorIn(actor, chat);
	const already = await findChatTask(taskId);
	if (already) {
		if (already.chat.groupId !== groupId)
			throw new TaskError(
				409,
				"in_another_chat",
				"That task is already in another chat",
			);
		const [card] = await db
			.select()
			.from(chatsMessages)
			.where(
				and(
					eq(chatsMessages.groupId, groupId),
					eq(chatsMessages.taskId, taskId),
				),
			)
			.limit(1);
		if (!card)
			throw new TaskError(409, "in_chat", "That task is already in this chat");
		return { message: await messageView(card), task: taskView(already) };
	}
	const [task] = await db
		.select({ id: tasks.id, title: tasks.title })
		.from(tasks)
		.where(
			and(
				eq(tasks.id, taskId),
				eq(tasks.organizationId, chat.group.organizationId),
				isNull(tasks.deletedAt),
			),
		);
	if (!task) throw new TaskError(404, "not_found", "Task not found");
	await db.insert(chatsTasks).values({
		taskId,
		groupId,
		createdByAgentId: actor.kind === "dev" ? actor.agentId : null,
	});
	const [message] = await db
		.insert(chatsMessages)
		.values({
			groupId,
			authorId: actor.kind === "user" ? actor.userId : null,
			authorAgentId: actor.kind === "dev" ? actor.agentId : null,
			turnId: actor.kind === "dev" ? (actor.turnId ?? null) : null,
			text: `Added a task: ${task.title}`,
			taskId,
			clientId: options.clientId,
		})
		.returning();
	const found = await findChatTask(taskId);
	if (!message || !found) throw new Error("The task's card was not stored");
	const card = { message: await messageView(message), task: taskView(found) };
	publishChats(chatsGroupChannel(groupId), {
		type: "message.created",
		...card,
	});
	return card;
}

async function actingOn(actor: TaskActor, taskId: string) {
	const found = await findChatTask(taskId);
	if (!found) throw new TaskError(404, "not_found", "Task not found");
	const chat = await loadChat(found.chat.groupId);
	assertActorIn(actor, chat);
	return { found, chat };
}

async function editedBefore(found: ChatTask, actor: TaskActor, field: string) {
	const [last] = await db
		.select()
		.from(chatsTaskNotes)
		.where(eq(chatsTaskNotes.taskId, found.task.id))
		.orderBy(desc(chatsTaskNotes.createdAt))
		.limit(1);
	return (
		last?.kind === "edited" &&
		last.text === field &&
		(actor.kind === "user"
			? last.userId === actor.userId
			: last.agentId === actor.agentId) &&
		Date.now() - last.createdAt.getTime() < EDIT_FOLD_MS
	);
}

export async function updateChatTask(
	deps: TurnDeps | null,
	actor: TaskActor,
	taskId: string,
	patch: TaskPatchInput,
): Promise<ApiTask> {
	const { found, chat } = await actingOn(actor, taskId);
	const { task } = found;
	const to =
		patch.status === "needs_review" ? "in_progress" : (patch.status ?? null);
	if (to && !canMoveTask(found.status, to)) {
		throw new TaskError(
			409,
			"invalid_status",
			"Reopen a done task before working on it again",
		);
	}
	const notes: { kind: TaskActivityKind; text?: string }[] = [];
	const fields: Partial<typeof tasks.$inferInsert> = {};
	const side: Partial<typeof chatsTasks.$inferInsert> = {};
	let rearm = false;

	if (patch.title !== undefined && patch.title !== task.title) {
		fields.title = patch.title;
		if (!(await editedBefore(found, actor, "title"))) {
			notes.push({ kind: "edited", text: "title" });
		}
	}
	if (
		patch.description !== undefined &&
		patch.description !== (task.description ?? "")
	) {
		fields.description = patch.description || null;
		if (!(await editedBefore(found, actor, "description"))) {
			notes.push({ kind: "edited", text: "description" });
		}
	}
	if (patch.assignee !== undefined) {
		const assignee = resolveAssignee(patch.assignee, actor, chat);
		assertAssignable(assignee, actor, chat);
		const userId = assignee && "userId" in assignee ? assignee.userId : null;
		const agentId = assignee && "agentId" in assignee ? assignee.agentId : null;
		if (
			userId !== (found.chat.assigneeAgentId ? null : task.assigneeId) ||
			agentId !== found.chat.assigneeAgentId
		) {
			fields.assigneeId = userId;
			side.assigneeAgentId = agentId;
			notes.push({ kind: "assigned", text: userId ?? agentId ?? "" });
			rearm = true;
		}
	}
	if (patch.scheduledAt !== undefined) {
		const at = patch.scheduledAt ? new Date(patch.scheduledAt) : null;
		if (at?.getTime() !== found.chat.scheduledAt?.getTime()) {
			side.scheduledAt = at;
			if (at) {
				fields.dueDate = null;
				notes.push({ kind: "scheduled", text: at.toISOString() });
			}
			rearm = true;
		}
	}
	if (patch.due !== undefined && !side.scheduledAt) {
		const due = dueDate(patch.due);
		if (due?.getTime() !== task.dueDate?.getTime()) {
			fields.dueDate = due;
			if (due) side.scheduledAt = null;
			rearm = true;
		}
	}
	if (patch.remind !== undefined && patch.remind !== found.chat.remind) {
		side.remind = patch.remind;
		rearm = true;
	}

	if (Object.keys(fields).length > 0) {
		await db.update(tasks).set(fields).where(eq(tasks.id, task.id));
		await recordTaskActivity(
			db,
			task.id,
			actor.userId
				? { kind: "user", userId: actor.userId }
				: { kind: "system" },
			[
				...(fields.title !== undefined
					? [{ fromTitle: task.title, toTitle: fields.title }]
					: []),
				...(fields.description !== undefined
					? [{ descriptionEdited: true }]
					: []),
				...(fields.assigneeId !== undefined &&
				fields.assigneeId !== task.assigneeId
					? [
							{
								fromAssigneeId: task.assigneeId,
								toAssigneeId: fields.assigneeId,
							},
						]
					: []),
			],
		);
	}
	if (rearm || Object.keys(side).length > 0) {
		await db
			.update(chatsTasks)
			.set({
				...side,
				...(rearm
					? { scheduleVersion: sql`${chatsTasks.scheduleVersion} + 1` }
					: {}),
			})
			.where(eq(chatsTasks.taskId, task.id));
	}
	await addNotes(found, actor, notes);
	if (to) {
		const current = await findChatTask(task.id);
		if (current) await setTaskStatus(current, to, actor);
	}
	if (rearm) {
		cancelRun(task.id);
		await armTask(deps, task.id);
	}
	const view = await publishTask(task.id);
	if (!view) throw new TaskError(404, "not_found", "Task not found");
	return view;
}

/** Starts the task: its Dev gets to work, or a person's task moves to in progress. */
export async function startChatTask(
	deps: TurnDeps | null,
	actor: TaskActor,
	taskId: string,
): Promise<ApiTask> {
	const { found } = await actingOn(actor, taskId);
	if (found.status === "done") {
		throw new TaskError(409, "invalid_status", "Reopen it first");
	}
	const dev = found.chat.assigneeAgentId;
	const isItsDev = actor.kind === "dev" && actor.agentId === dev;
	if (dev && !isItsDev) {
		if (!deps) {
			throw new TaskError(409, "no_runtime", "Devs don't run here yet");
		}
		await startTaskWork(deps, found);
	} else {
		await setTaskStatus(found, "in_progress", actor);
	}
	const view = await publishTask(taskId);
	if (!view) throw new TaskError(404, "not_found", "Task not found");
	return view;
}

/** A person's comment on a task its Dev works on, as a turn for that Dev. */
async function wakeForComment(
	deps: TurnDeps,
	found: ChatTask,
	by: { id: string; name: string },
	text: string,
) {
	const agentId = found.chat.assigneeAgentId ?? found.chat.createdByAgentId;
	if (!agentId) return;
	const header = turnHeader("Task comment", [
		["Task", `${found.task.id} "${found.task.title}"`],
		["From", by.name],
		["Status", found.status],
		["Time", formatTime(new Date())],
	]);
	const [turn] = await db
		.insert(chatsTurns)
		.values({
			agentId,
			groupId: found.chat.groupId,
			userId: by.id,
			prompt: `${header}\n\n${by.name} commented on this task:\n${text}\n\nAct on it if it asks something of you: carry on with the task, and note what you did with \`dev task comment ${found.task.id} "<note>"\`. Tell the chat with \`reply\` only what people need to see. If the comment needs nothing from you, do nothing.`,
		})
		.returning({ id: chatsTurns.id });
	if (turn) await deps.turnRuns.start(turn.id);
}

export async function commentOnChatTask(
	deps: TurnDeps | null,
	actor: TaskActor,
	taskId: string,
	text: string,
): Promise<TaskActivity> {
	const { found, chat } = await actingOn(actor, taskId);
	const [activity] = await addNotes(found, actor, [
		{ kind: actor.kind === "dev" ? "progress" : "comment", text },
	]);
	if (!activity) throw new Error("The comment was not stored");
	if (deps && actor.kind === "user") {
		const by = chat.people.find((person) => person.id === actor.userId);
		if (by) await wakeForComment(deps, found, by, text);
	}
	return activity;
}

export async function chatTaskDetail(actor: TaskActor, taskId: string) {
	const { found } = await actingOn(actor, taskId);
	return { task: taskView(found), activity: await taskNotes(taskId) };
}

/** Deletes the task and the messages that only carried its card. */
export async function deleteChatTask(actor: TaskActor, taskId: string) {
	const { found } = await actingOn(actor, taskId);
	const groupId = found.chat.groupId;
	cancelRun(taskId);
	const cards = await db
		.delete(chatsMessages)
		.where(
			and(
				eq(chatsMessages.taskId, taskId),
				isNull(chatsMessages.fileId),
				isNull(chatsMessages.questionId),
			),
		)
		.returning({ id: chatsMessages.id });
	await db
		.update(tasks)
		.set({ deletedAt: new Date() })
		.where(eq(tasks.id, taskId));
	const channel = chatsGroupChannel(groupId);
	for (const card of cards) {
		publishChats(channel, {
			type: "message.deleted",
			groupId,
			messageId: card.id,
		});
	}
	publishChats(channel, { type: "task.deleted", groupId, taskId });
}

/** The Dev a box's request speaks for, as a task actor. */
export async function devActor(claims: {
	agentId: string;
	turnId: string;
	userId: string | null;
}): Promise<TaskActor> {
	const [agent] = await db
		.select({ ownerUserId: chatsAgents.ownerUserId })
		.from(chatsAgents)
		.where(eq(chatsAgents.id, claims.agentId));
	return {
		kind: "dev",
		agentId: claims.agentId,
		userId: claims.userId ?? agent?.ownerUserId ?? null,
		turnId: claims.turnId,
	};
}
