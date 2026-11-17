import type { Task } from "../model/model.ts";
import { isDone } from "../task-status/task-status.ts";
import { taskDate } from "../task-time/task-time.ts";

export type TaskSectionLabel =
	| "Overdue"
	| "Today"
	| "Upcoming"
	| "No date"
	| "Done";

const open = (t: Task) => !isDone(t);

const SECTIONS: {
	label: TaskSectionLabel;
	match: (t: Task, today: string) => boolean;
}[] = [
	{
		label: "Overdue",
		match: (t, today) => open(t) && (taskDate(t) ?? today) < today,
	},
	{ label: "Today", match: (t, today) => open(t) && taskDate(t) === today },
	{
		label: "Upcoming",
		match: (t, today) => open(t) && (taskDate(t) ?? "") > today,
	},
	{ label: "No date", match: (t) => open(t) && !taskDate(t) },
	{ label: "Done", match: (t) => !open(t) },
];

/** Tasks grouped by when they're due (`today` is a local `YYYY-MM-DD`), keeping their order; empty groups are left out. */
export function taskSections(
	tasks: Task[],
	today: string,
): { label: TaskSectionLabel; tasks: Task[] }[] {
	return SECTIONS.map((s) => ({
		label: s.label,
		tasks: tasks.filter((t) => s.match(t, today)),
	})).filter((s) => s.tasks.length);
}
