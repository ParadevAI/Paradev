import {
	liveStream,
	type SessionSnapshot,
	subagentAncestors,
	subagentItem,
} from "@superset/chat/core";
import type { BackgroundTask } from "@superset/chat/protocol";

export type RunningRow = {
	task: BackgroundTask;
	kind: "subagent" | "shell";
	name: string;
	step: string | undefined;
	canStop: boolean;
	canBackground: boolean;
	needsApproval: boolean;
	runningSubagents: number;
};

export function runningRows(
	tasks: readonly BackgroundTask[],
	snapshot: SessionSnapshot,
	asking: ReadonlySet<string>,
	fallbackSubagentName: string,
	waitingLabel: (count: number) => string,
): RunningRow[] {
	if (tasks.length === 0) return [];
	const runningIds = new Set(
		tasks
			.filter((task) => {
				if (task.kind !== "subagent") return false;
				const status =
					subagentItem(snapshot.items, task.id)?.subagentStatus ??
					task.subagentStatus;
				return status === undefined || status === "running";
			})
			.map((task) => task.id),
	);
	const owners = new Map<string, string>();
	const counts = new Map<string, number>();
	for (const id of runningIds) {
		let owner: string | undefined;
		for (const ancestor of subagentAncestors(snapshot.items, id))
			if (ancestor.id !== id && runningIds.has(ancestor.id))
				owner = ancestor.id;
		if (!owner) continue;
		owners.set(id, owner);
		counts.set(owner, (counts.get(owner) ?? 0) + 1);
	}
	const askingRows = new Set<string>();
	for (const id of asking) {
		let row = id;
		const seen = new Set<string>();
		while (owners.has(row) && !seen.has(row)) {
			seen.add(row);
			row = owners.get(row) ?? row;
		}
		askingRows.add(row);
	}
	return tasks.flatMap((task): RunningRow[] => {
		const step =
			liveStream(snapshot, "background", task.id) || task.detail || undefined;
		if (task.kind !== "subagent")
			return [
				{
					task,
					kind: "shell",
					name: task.name,
					step,
					canStop: task.canStop,
					canBackground: false,
					needsApproval: false,
					runningSubagents: 0,
				},
			];
		const item = subagentItem(snapshot.items, task.id);
		const status = item?.subagentStatus ?? task.subagentStatus;
		if (status !== undefined && status !== "running") return [];
		if (owners.has(task.id)) return [];
		const runningSubagents = counts.get(task.id) ?? 0;
		return [
			{
				task,
				kind: "subagent",
				name: item?.title || task.name || fallbackSubagentName,
				step: runningSubagents > 0 ? waitingLabel(runningSubagents) : step,
				canStop: item?.canStop ?? task.canStop,
				canBackground: (item?.canBackground ?? task.canBackground) === true,
				needsApproval: askingRows.has(task.id),
				runningSubagents,
			},
		];
	});
}
