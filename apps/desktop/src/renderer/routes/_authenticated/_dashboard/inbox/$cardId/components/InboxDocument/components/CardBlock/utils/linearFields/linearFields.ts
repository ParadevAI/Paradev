import type {
	LinearCycleView,
	LinearFieldsView,
	LinearLabelView,
	LinearOptionsView,
} from "../../types";

export type IssueFieldKey = keyof LinearFieldsView;

/** Linear's order of the chip row. */
export const ISSUE_FIELD_KEYS: readonly IssueFieldKey[] = [
	"state",
	"priority",
	"assignee",
	"project",
	"estimate",
	"labels",
	"cycle",
];

const sameLabels = (a: readonly string[], b: readonly string[]) =>
	[...a].sort().join() === [...b].sort().join();

export function sameField(
	key: IssueFieldKey,
	a: Partial<LinearFieldsView>,
	b: Partial<LinearFieldsView>,
): boolean {
	if (key === "labels")
		return (
			a.labels !== undefined &&
			b.labels !== undefined &&
			sameLabels(a.labels, b.labels)
		);
	return a[key] === b[key];
}

/** The keys of `next` that differ from the issue, which is all an action sends. */
export function changedFields(
	current: LinearFieldsView,
	next: Partial<LinearFieldsView>,
): Partial<LinearFieldsView> {
	return Object.fromEntries(
		Object.entries(next).filter(
			([key, value]) =>
				value !== undefined && !sameField(key as IssueFieldKey, current, next),
		),
	);
}

/** Checks or unchecks a label; a checked label of a group takes the place of the group's other one. */
export function toggleLabel(
	chosen: readonly string[],
	id: string,
	labels: readonly LinearLabelView[],
): string[] {
	if (chosen.includes(id)) return chosen.filter((label) => label !== id);
	const group = labels.find((label) => label.id === id)?.group ?? null;
	const kept =
		group === null
			? chosen
			: chosen.filter(
					(other) =>
						labels.find((label) => label.id === other)?.group !== group,
				);
	return [...kept, id];
}

/** The status Linear presets when an issue leaves triage: the team's first backlog status, or its first unstarted one. */
export function acceptState(options: LinearOptionsView): string | undefined {
	return (
		options.states.find((state) => state.type === "backlog") ??
		options.states.find((state) => state.type === "unstarted") ??
		options.states[0]
	)?.id;
}

export function nextCycle(
	cycles: readonly LinearCycleView[],
	now: number,
): LinearCycleView | undefined {
	return cycles.find((cycle) => Date.parse(cycle.startsAt) > now);
}

const PRIORITY_KEYS = ["none", "urgent", "high", "medium", "low"] as const;

/** Linear's priority number as the name the task icons take. */
export function priorityKey(priority: number): (typeof PRIORITY_KEYS)[number] {
	return PRIORITY_KEYS[priority] ?? "none";
}
