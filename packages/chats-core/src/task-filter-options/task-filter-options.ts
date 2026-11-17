import type { ChatState } from "../chat-state/chat-state.ts";
import { chatTitle } from "../devs/devs.ts";
import type { Task, TaskStatus } from "../model/model.ts";
import {
	TASK_STATUS_LABEL,
	TASK_STATUSES,
} from "../task-status/task-status.ts";
import {
	type FilterProperty,
	labelCounts,
	OPEN_CHIP,
	type TaskFilterChip,
	type TaskGrouping,
	type TaskOrdering,
} from "../task-views/task-views.ts";

export interface FilterOption {
	value: string;
	label: string;
	/** How many of the tasks carry it, where that's worth showing. */
	count?: number;
}

export const PROPERTY_LABEL: Record<FilterProperty, string> = {
	status: "Status",
	assignee: "Assignee",
	label: "Label",
	chat: "Chat",
	due: "Due",
};

export const OP_LABEL: Record<
	TaskFilterChip["op"],
	(property: FilterProperty) => string
> = {
	is: (p) => (p === "label" ? "includes any of" : "is"),
	is_not: (p) => (p === "label" ? "excludes" : "is not"),
	all: () => "includes all of",
};

/** The ops a property offers: `all` only makes sense for labels, which a task has several of. */
export const opsFor = (property: FilterProperty): TaskFilterChip["op"][] =>
	property === "label" ? ["is", "all", "is_not"] : ["is", "is_not"];

const DUE: FilterOption[] = [
	{ value: "overdue", label: "Overdue" },
	{ value: "today", label: "Today" },
	{ value: "tomorrow", label: "Tomorrow" },
	{ value: "week", label: "Next 7 days" },
	{ value: "none", label: "No date" },
];

/** What a property's chip can pick from: fixed lists, or what's in use in the tasks (labels, chats, who has tasks). */
export function filterOptions(
	state: ChatState,
	tasks: Task[],
	property: FilterProperty,
): FilterOption[] {
	const count = (test: (t: Task) => boolean) => tasks.filter(test).length;
	switch (property) {
		case "status":
			return TASK_STATUSES.map((s) => ({
				value: s,
				label: TASK_STATUS_LABEL[s],
				count: count((t) => t.status === s),
			}));
		case "due":
			return DUE;
		case "label":
			return labelCounts(tasks).map((l) => ({
				value: l.name,
				label: l.name,
				count: l.count,
			}));
		case "chat":
			return state.chats
				.map((c) => ({
					value: c.id,
					label: chatTitle(state, c),
					count: count((t) => t.chatId === c.id),
				}))
				.filter((o) => o.count > 0)
				.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
		case "assignee": {
			const people = [
				...new Set(
					tasks.flatMap((t) =>
						t.assigneeId && t.assigneeId !== state.meId ? [t.assigneeId] : [],
					),
				),
			].map((id) => ({
				value: `user:${id}`,
				label: state.members[id]?.name ?? "Someone",
				count: count((t) => t.assigneeId === id),
			}));
			return [
				{
					value: "me",
					label: "Me",
					count: count((t) => t.assigneeId === state.meId),
				},
				{
					value: "devs",
					label: "Any Dev",
					count: count((t) => t.assigneeDevId !== null),
				},
				{
					value: "none",
					label: "Unassigned",
					count: count((t) => !t.assigneeId && !t.assigneeDevId),
				},
				...people,
			];
		}
	}
}

/** A chip's values as its bar shows them: "Gmail", "Gmail, Linear", "Gmail +2". */
export function chipValueText(
	options: FilterOption[],
	chip: TaskFilterChip,
): string {
	const names = chip.values.map(
		(v) =>
			options.find((o) => o.value.toLowerCase() === v.toLowerCase())?.label ??
			v,
	);
	if (!names.length) return "…";
	return names.length <= 2
		? names.join(", ")
		: `${names[0]} +${names.length - 1}`;
}

/** The chips after picking a value on a property: a new chip, or the value toggled on that property's chip. */
export function toggleChipValue(
	chips: TaskFilterChip[],
	property: FilterProperty,
	value: string,
): TaskFilterChip[] {
	const same = (v: string) => v.toLowerCase() === value.toLowerCase();
	const i = chips.findIndex((c) => c.property === property);
	if (i < 0) return [...chips, { property, op: "is", values: [value] }];
	const chip = chips[i]!;
	const values = chip.values.some(same)
		? chip.values.filter((v) => !same(v))
		: [...chip.values, value];
	return values.length
		? chips.map((c, j) => (j === i ? { ...chip, values } : c))
		: chips.filter((_, j) => j !== i);
}

const hidesDone = (chip: TaskFilterChip) =>
	chip.property === "status" &&
	(chip.op === "is_not"
		? chip.values.includes("done")
		: !chip.values.includes("done"));

/** Whether a view's filters let done tasks through: Display's "Show done tasks" reads the status filter, nothing else. */
export const showsDone = (chips: TaskFilterChip[]): boolean =>
	!chips.some(hidesDone);

/** The filters with done tasks shown or hidden, by changing the status filter only (or adding "Status is not Done"). */
export function withDone(
	chips: TaskFilterChip[],
	show: boolean,
): TaskFilterChip[] {
	if (showsDone(chips) === show) return chips;
	const status = chips.find((c) => c.property === "status");
	if (!status) return [OPEN_CHIP, ...chips];
	const has = status.values.includes("done");
	const values = has
		? status.values.filter((v) => v !== "done")
		: [...status.values, "done"];
	if (!values.length)
		return show
			? chips.filter((c) => c !== status)
			: chips.map((c) => (c === status ? OPEN_CHIP : c));
	return chips.map((c) => (c === status ? { ...c, values } : c));
}

/** Display's names for the groupings and orderings, in both apps. */
export const GROUPING_LABEL: Record<TaskGrouping, string> = {
	status: "Status",
	label: "Label",
	assignee: "Assignee",
	chat: "Chat",
	due: "Due date",
	none: "No grouping",
};
export const ORDERING_LABEL: Record<TaskOrdering, string> = {
	due: "Due date",
	created: "Newest",
	title: "Title",
};

/** The statuses the filters let through (all of them without a status chip). */
export function shownStatuses(chips: TaskFilterChip[]): TaskStatus[] {
	const status = chips.find((c) => c.property === "status");
	if (!status?.values.length) return [...TASK_STATUSES];
	return TASK_STATUSES.filter(
		(s) => status.values.includes(s) === (status.op === "is"),
	);
}

/**
 * The filters with one status shown or hidden, for a menu that ticks the statuses it shows (the phone's). Every status
 * shown drops the chip; all but Done is "Status is not Done", as the built-in views and "Show done tasks" write it; the
 * last status shown stays, so the list never filters to nothing. A new status chip goes first.
 */
export function toggleShownStatus(
	chips: TaskFilterChip[],
	status: TaskStatus,
): TaskFilterChip[] {
	const now = shownStatuses(chips);
	const next = now.includes(status)
		? now.filter((s) => s !== status)
		: TASK_STATUSES.filter((s) => s === status || now.includes(s));
	if (!next.length) return chips;
	const rest = chips.filter((c) => c.property !== "status");
	const at = Math.max(
		0,
		chips.findIndex((c) => c.property === "status"),
	);
	const hidden = TASK_STATUSES.filter((s) => !next.includes(s));
	if (!hidden.length) return rest;
	const chip: TaskFilterChip =
		hidden.length === 1
			? { property: "status", op: "is_not", values: hidden }
			: { property: "status", op: "is", values: next };
	return [...rest.slice(0, at), chip, ...rest.slice(at)];
}
