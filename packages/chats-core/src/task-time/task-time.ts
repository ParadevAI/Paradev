import { formatDue } from "../format-due/format-due.ts";
import type { Task } from "../model/model.ts";
import { toDateString } from "../task-command/task-command.ts";

/** Within this long, a timed task reads as soon (Roma's orange). */
const SOON_MS = 2 * 60 * 60_000;

/** How a due chip looks: past due, due within two hours, today, or later. */
export type TaskWhenTone = "overdue" | "soon" | "today" | "later";

export interface TaskWhen {
	/** "Today 11 AM", "Tomorrow 10 AM", "Sat", "12 Oct 9:30 AM". */
	label: string;
	tone: TaskWhenTone;
	/** The time is a reminder (a bell), not when a Dev starts. */
	reminder: boolean;
}

/** The task's local calendar date: its time's, or its due date. Null when it has neither. */
export function taskDate(
	task: Pick<Task, "due" | "scheduledAt">,
): string | null {
	return task.scheduledAt ? toDateString(new Date(task.scheduledAt)) : task.due;
}

/** "11 AM", "9:30 AM" (or the locale's 24-hour form): minutes only when there are some. */
export function formatClock(date: Date): string {
	return date.toLocaleTimeString(undefined, {
		hour: "numeric",
		...(date.getMinutes() ? { minute: "2-digit" } : {}),
	});
}

/** "Today 11 AM", "Tomorrow 9:30 AM", "Saturday 6 PM": a moment as due chips word it. */
export function whenLabel(iso: string, now: Date): string {
	const at = new Date(iso);
	return `${formatDue(toDateString(at), now).label} ${formatClock(at)}`;
}

/** A due chip's quick picks, as Roma's: today, tomorrow and next week (the coming Monday). */
export function dueQuickPicks(now: Date): { label: string; date: string }[] {
	const inDays = (days: number) =>
		toDateString(
			new Date(now.getFullYear(), now.getMonth(), now.getDate() + days),
		);
	return [
		{ label: "Today", date: inDays(0) },
		{ label: "Tomorrow", date: inDays(1) },
		{ label: "Next week", date: inDays((8 - now.getDay()) % 7 || 7) },
	];
}

/** The due chip for a task, or null when it has no date or time. */
export function taskWhen(
	task: Pick<
		Task,
		"due" | "scheduledAt" | "remind" | "assigneeDevId" | "status"
	>,
	now: Date,
): TaskWhen | null {
	const date = taskDate(task);
	if (!date) return null;
	const day = formatDue(date, now);
	const open = task.status !== "done";
	const today = date === toDateString(now);
	if (!task.scheduledAt)
		return {
			label: day.label,
			tone: open && day.overdue ? "overdue" : today ? "today" : "later",
			reminder: false,
		};

	const ahead = new Date(task.scheduledAt).getTime() - now.getTime();
	const tone: TaskWhenTone = !open
		? "later"
		: ahead < 0
			? "overdue"
			: ahead <= SOON_MS
				? "soon"
				: today
					? "today"
					: "later";
	return {
		label: whenLabel(task.scheduledAt, now),
		tone,
		reminder: task.remind || task.assigneeDevId === null,
	};
}
