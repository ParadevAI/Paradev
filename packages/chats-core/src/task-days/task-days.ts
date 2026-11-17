import type { Task } from "../model/model.ts";
import { toDateString } from "../task-command/task-command.ts";
import { isDone } from "../task-status/task-status.ts";
import { taskDate } from "../task-time/task-time.ts";

/** Which tasks a list shows: what's still to do, or what's done. */
export type TaskShow = "todo" | "done";

export interface TaskDay {
	/** A `YYYY-MM-DD`, or "overdue" / "none". */
	key: string;
	/** "Overdue", "Today", "Tomorrow", "Yesterday", "Fri, Oct 17" (the locale's), "No date". */
	label: string;
	tasks: Task[];
}

const shift = (date: string, days: number) => {
	const [y, m, d] = date.split("-").map(Number);
	return toDateString(new Date(y!, m! - 1, d! + days));
};

/** A day as its list heading: relative near today, else weekday and date. */
export function dayLabel(date: string, today: string): string {
	if (date === today) return "Today";
	if (date === shift(today, 1)) return "Tomorrow";
	if (date === shift(today, -1)) return "Yesterday";
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

/**
 * Tasks grouped by day (`today` is a local `YYYY-MM-DD`), each group in the tasks' order; empty days are left out.
 * To do: everything past due in one Overdue group, then today, tomorrow and each later day, then No date. Done: the
 * latest day first, then No date.
 */
export function taskDays(
	tasks: Task[],
	today: string,
	show: TaskShow,
): TaskDay[] {
	const groups = new Map<string, Task[]>();
	for (const task of tasks) {
		if (isDone(task) !== (show === "done")) continue;
		const date = taskDate(task);
		const key = !date
			? "none"
			: show === "todo" && date < today
				? "overdue"
				: date;
		groups.set(key, [...(groups.get(key) ?? []), task]);
	}
	// Dates sort as text; Overdue goes first and No date last whichever way the days run.
	const rank = (key: string) =>
		key === "overdue" ? -1 : key === "none" ? 1 : 0;
	const keys = [...groups.keys()].sort(
		(a, b) =>
			rank(a) - rank(b) ||
			(show === "todo" ? (a < b ? -1 : 1) : a < b ? 1 : -1),
	);
	return keys.map((key) => ({
		key,
		label:
			key === "overdue"
				? "Overdue"
				: key === "none"
					? "No date"
					: dayLabel(key, today),
		tasks: groups.get(key)!,
	}));
}
