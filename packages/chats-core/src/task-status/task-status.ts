import type { Task, TaskActivityKind, TaskStatus } from "../model/model.ts";

export const TASK_STATUSES: readonly TaskStatus[] = [
	"todo",
	"in_progress",
	"done",
];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
	todo: "To do",
	in_progress: "In progress",
	done: "Done",
};

/** Where each status may go. A done task is reopened (back to to do) before anyone works on it again. */
const NEXT: Record<TaskStatus, readonly TaskStatus[]> = {
	todo: ["in_progress", "done"],
	in_progress: ["todo", "done"],
	done: ["todo"],
};

/** Whether a task may move from one status to another; staying put is always allowed (retries, double clicks). */
export const canMoveTask = (from: TaskStatus, to: TaskStatus) =>
	from === to || NEXT[from].includes(to);

export const isDone = (task: Pick<Task, "status">) => task.status === "done";

/** What ticking a task's ring does: done ↔ to do. */
export const toggledStatus = (status: TaskStatus): TaskStatus =>
	status === "done" ? "todo" : "done";

/** How a status change reads in the activity log. */
export const statusActivityKind = (
	from: TaskStatus,
	to: TaskStatus,
): TaskActivityKind =>
	to === "done"
		? "done"
		: from === "done"
			? "reopened"
			: to === "in_progress" && from === "todo"
				? "started"
				: "status";

/**
 * Starting a task from its "…" menu: a Dev's task starts a task turn (`restart` once under way); a person's or an
 * unassigned task still to do is only marked in progress, and says so.
 */
export interface TaskStartAction {
	label: string;
	kind: "start" | "restart" | "mark";
}

/** What a task's "…" menu offers to start, or null. */
export function taskStartAction(
	task: Pick<Task, "status">,
	devName: string | null,
): TaskStartAction | null {
	if (isDone(task)) return null;
	if (devName)
		return task.status === "todo"
			? { label: `Start ${devName} now`, kind: "start" }
			: { label: `Ask ${devName} to restart`, kind: "restart" };
	return task.status === "todo"
		? { label: "Mark in progress", kind: "mark" }
		: null;
}
