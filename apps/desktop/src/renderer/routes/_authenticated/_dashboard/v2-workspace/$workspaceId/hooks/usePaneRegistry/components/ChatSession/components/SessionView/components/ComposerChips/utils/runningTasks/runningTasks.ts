import type { BackgroundTask } from "@superset/chat/protocol";

export function runningTasks(tasks: readonly BackgroundTask[] | undefined): {
	subagents: BackgroundTask[];
	processes: BackgroundTask[];
} {
	const running = (tasks ?? []).filter(
		(task) =>
			task.subagentStatus === undefined || task.subagentStatus === "running",
	);
	const subagentIds = new Set(
		running.filter((task) => task.kind === "subagent").map((task) => task.id),
	);
	return {
		subagents: running.filter(
			(task) =>
				task.kind === "subagent" &&
				!(task.parentId && subagentIds.has(task.parentId)),
		),
		processes: running.filter((task) => task.kind === "process"),
	};
}
