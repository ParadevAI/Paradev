import { parseWhen, type TaskStatus } from "@superset/chats-core";
import type { ApiTask } from "@superset/chats-sync";
import { db } from "@superset/db/client";
import { chatsAgents, users } from "@superset/db/schema";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { toUser } from "../views";
import { TaskError } from "./chat-tasks";
import { chatTasksOfGroups, taskView } from "./task-store";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(:\d{2})?$/;

const DUE_HELP =
	'--due: say it like "friday", "tomorrow 9am" or "in 2 hours", or give a date (2026-10-31), a time in UTC ("2026-10-31 09:00") or an ISO time';

const utc = (date: string, hour: number, minute: number) =>
	new Date(
		`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
	);

/**
 * When, as a Dev writes it on the command line: a date, or a time. A box
 * has no time zone of its own, so words and bare times are read in UTC.
 */
export function cliDue(
	due: string,
	now: Date,
): { due: string } | { scheduledAt: string } {
	const text = due.trim();
	if (DATE.test(text)) return { due: text };
	const local = LOCAL.exec(text);
	if (local?.[1]) {
		return {
			scheduledAt: utc(
				local[1],
				Number(local[2]),
				Number(local[3]),
			).toISOString(),
		};
	}
	if (z.string().datetime({ offset: true }).safeParse(text).success) {
		return { scheduledAt: new Date(text).toISOString() };
	}
	const when = parseWhen(text, {
		date: now.toISOString().slice(0, 10),
		time: { hour: now.getUTCHours(), minute: now.getUTCMinutes() },
	});
	if (!when) throw new TaskError(400, "invalid", DUE_HELP);
	if (when.kind === "date") return { due: when.date };
	if (when.kind === "time") {
		return {
			scheduledAt: utc(
				when.date,
				when.time.hour,
				when.time.minute,
			).toISOString(),
		};
	}
	return {
		scheduledAt: new Date(now.getTime() + when.minutes * 60_000).toISOString(),
	};
}

export const cliTaskInput = z.object({
	title: z.string().trim().min(1).max(500),
	description: z.string().max(20_000).optional(),
	assignee: z.string().max(200).optional(),
	due: z.string().trim().min(1).max(100).optional(),
	remind: z.boolean().optional(),
	repeat: z.string().optional(),
});

export const cliTaskPatch = z.object({
	title: z.string().trim().min(1).max(500).optional(),
	description: z.string().max(20_000).optional(),
	status: z.enum(["todo", "in_progress", "done"]).optional(),
	assignee: z.string().max(200).optional(),
	due: z.string().trim().min(1).max(100).nullable().optional(),
	remind: z.boolean().optional(),
	repeat: z.string().optional(),
});

/** The fields a task takes, from what the CLI sent. */
export function cliFields<T extends { due?: string | null; repeat?: string }>(
	input: T,
	now: Date,
) {
	if (input.repeat && input.repeat !== "none") {
		throw new TaskError(400, "invalid", "Repeating tasks aren't available yet");
	}
	const { due, repeat: _repeat, ...rest } = input;
	return {
		...rest,
		...(due === undefined
			? {}
			: due === null || due === "none"
				? { due: null, scheduledAt: null }
				: cliDue(due, now)),
	};
}

export const cliTaskQuery = z.object({
	assignee: z.string().optional(),
	status: z.enum(["todo", "in_progress", "done", "open"]).default("open"),
	search: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(25),
	offset: z.coerce.number().int().min(0).default(0),
});

export interface CliTask {
	id: string;
	title: string;
	description: string;
	status: TaskStatus;
	due: string | null;
	scheduledAt: string | null;
	remind: boolean;
	assignee: string | null;
}

async function namesOf(tasks: ApiTask[]) {
	const userIds = [...new Set(tasks.flatMap((task) => task.assigneeId ?? []))];
	const agentIds = [
		...new Set(tasks.flatMap((task) => task.assigneeDevId ?? [])),
	];
	const [people, devs] = await Promise.all([
		userIds.length
			? db
					.select({ id: users.id, email: users.email, name: users.name })
					.from(users)
					.where(inArray(users.id, userIds))
			: [],
		agentIds.length
			? db
					.select({ id: chatsAgents.id, name: chatsAgents.name })
					.from(chatsAgents)
					.where(inArray(chatsAgents.id, agentIds))
			: [],
	]);
	return new Map<string, string>([
		...people.map((user) => [user.id, toUser(user).displayName] as const),
		...devs.map((dev) => [dev.id, dev.name] as const),
	]);
}

export async function cliTasks(tasks: ApiTask[]): Promise<CliTask[]> {
	const names = await namesOf(tasks);
	return tasks.map((task) => ({
		id: task.id,
		title: task.title,
		description: task.description,
		status: task.status,
		due: task.due,
		scheduledAt: task.scheduledAt,
		remind: task.remind,
		assignee: names.get(task.assigneeDevId ?? task.assigneeId ?? "") ?? null,
	}));
}

/** A chat's tasks as `dev task list` asks for them, newest first. */
export async function listCliTasks(
	groupId: string,
	me: string,
	query: z.output<typeof cliTaskQuery>,
) {
	const all = await cliTasks(
		(await chatTasksOfGroups([groupId]))
			.map(taskView)
			.filter(
				(task) =>
					(query.status === "open"
						? task.status !== "done"
						: task.status === query.status) &&
					(query.assignee !== "me" || task.assigneeDevId === me) &&
					(query.assignee !== "none" ||
						(!task.assigneeDevId && !task.assigneeId)),
			),
	);
	const who = query.assignee?.toLowerCase();
	const search = query.search?.toLowerCase();
	const matched = all.filter(
		(task) =>
			(!who ||
				who === "me" ||
				who === "none" ||
				task.assignee?.toLowerCase() === who) &&
			(!search ||
				`${task.title}\n${task.description}`.toLowerCase().includes(search)),
	);
	const tasks = matched.slice(query.offset, query.offset + query.limit);
	const next = query.offset + tasks.length;
	return {
		tasks,
		total: matched.length,
		nextOffset: next < matched.length ? next : null,
	};
}
