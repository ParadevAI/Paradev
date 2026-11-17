import type { ChatState } from "../chat-state/chat-state.ts";
import { chatTitle } from "../devs/devs.ts";
import type { Task, TaskStatus } from "../model/model.ts";
import {
	isDone,
	TASK_STATUS_LABEL,
	TASK_STATUSES,
} from "../task-status/task-status.ts";
import { taskDate } from "../task-time/task-time.ts";

export const FILTER_PROPERTIES = [
	"status",
	"assignee",
	"label",
	"chat",
	"due",
] as const;
export type FilterProperty = (typeof FILTER_PROPERTIES)[number];

/** `is` keeps a task matching any value, `is_not` one matching none; `all` (labels only) one with every value. */
export type FilterOp = "is" | "is_not" | "all";

/**
 * One chip of the filter bar. Values by property: statuses; `me` | `devs` | `none` | `user:<id>` | `dev:<id>`;
 * label names (any case); chat ids; `overdue` | `today` | `tomorrow` | `week` | `none`.
 */
export interface TaskFilterChip {
	property: FilterProperty;
	op: FilterOp;
	values: string[];
}

export const GROUPINGS = [
	"status",
	"label",
	"assignee",
	"chat",
	"due",
	"none",
] as const;
export type TaskGrouping = (typeof GROUPINGS)[number];
export const ORDERINGS = ["due", "created", "title"] as const;
export type TaskOrdering = (typeof ORDERINGS)[number];
export type TaskLayout = "list" | "board";

/** What a view keeps and how it shows it: the filters and the display, which a saved view stores. */
export interface TaskViewSpec {
	filters: TaskFilterChip[];
	groupBy: TaskGrouping;
	orderBy: TaskOrdering;
	layout: TaskLayout;
}

export interface SavedTaskView extends TaskViewSpec {
	id: string;
	name: string;
}

export const OPEN_CHIP: TaskFilterChip = {
	property: "status",
	op: "is_not",
	values: ["done"],
};

export const ALL_TASKS_VIEW: TaskViewSpec = {
	filters: [OPEN_CHIP],
	groupBy: "status",
	orderBy: "due",
	layout: "list",
};

/** The views every account has, which can't be changed or removed; changing one offers saving it as a new view. */
export const BUILT_IN_VIEWS: {
	id: string;
	name: string;
	spec: TaskViewSpec;
}[] = [
	{ id: "all", name: "All tasks", spec: ALL_TASKS_VIEW },
	{
		id: "mine",
		name: "My open",
		spec: {
			...ALL_TASKS_VIEW,
			filters: [OPEN_CHIP, { property: "assignee", op: "is", values: ["me"] }],
		},
	},
];

/** A tab of the views row: the built-in views, then the person's saved ones. */
export interface ViewTab {
	id: string;
	name: string;
	builtIn: boolean;
}

export const viewTabs = (saved: SavedTaskView[]): ViewTab[] => [
	...BUILT_IN_VIEWS.map((v) => ({ id: v.id, name: v.name, builtIn: true })),
	...saved.map((v) => ({ id: v.id, name: v.name, builtIn: false })),
];

/** A view's spec as saved, by id; one that's gone (deleted on another device) reads as All tasks. */
export function viewSpecOf(saved: SavedTaskView[], id: string): TaskViewSpec {
	const view =
		saved.find((v) => v.id === id) ??
		BUILT_IN_VIEWS.find((v) => v.id === id)?.spec ??
		ALL_TASKS_VIEW;
	return {
		filters: view.filters,
		groupBy: view.groupBy,
		orderBy: view.orderBy,
		layout: view.layout,
	};
}

export const lowerLabel = (name: string) => name.trim().toLowerCase();

export const taskLabels = (task: Pick<Task, "labels">): string[] =>
	task.labels ?? [];

/** Every label in use with how many tasks carry it, most used first; one spelling per name, the first met. */
export function labelCounts(
	tasks: Pick<Task, "labels">[],
): { name: string; count: number }[] {
	const seen = new Map<string, { name: string; count: number }>();
	for (const t of tasks)
		for (const name of taskLabels(t)) {
			const entry = seen.get(lowerLabel(name));
			if (entry) entry.count += 1;
			else seen.set(lowerLabel(name), { name, count: 1 });
		}
	return [...seen.values()].sort(
		(a, b) => b.count - a.count || a.name.localeCompare(b.name),
	);
}

/** Adds a label unless the task has it in any case, and drops blanks; the labels as the API takes them. */
export function addLabel(labels: string[], name: string): string[] {
	const trimmed = name.trim();
	return !trimmed || labels.some((l) => lowerLabel(l) === lowerLabel(trimmed))
		? labels
		: [...labels, trimmed];
}

export const removeLabel = (labels: string[], name: string) =>
	labels.filter((l) => lowerLabel(l) !== lowerLabel(name));

const daysAfter = (today: string, days: number) => {
	const d = new Date(`${today}T12:00:00`);
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0, 10);
};

function matchesAny(
	state: ChatState,
	task: Task,
	property: FilterProperty,
	values: string[],
	today: string,
): boolean {
	switch (property) {
		case "status":
			return values.includes(task.status);
		case "chat":
			return values.includes(task.chatId);
		case "label": {
			const mine = taskLabels(task).map(lowerLabel);
			return values.some((v) => mine.includes(lowerLabel(v)));
		}
		case "assignee":
			return values.some((v) => {
				if (v === "me") return task.assigneeId === state.meId;
				if (v === "devs") return task.assigneeDevId !== null;
				if (v === "none")
					return task.assigneeId === null && task.assigneeDevId === null;
				if (v.startsWith("user:")) return task.assigneeId === v.slice(5);
				return v.startsWith("dev:") && task.assigneeDevId === v.slice(7);
			});
		case "due": {
			const date = taskDate(task);
			return values.some((v) => {
				if (v === "none") return !date;
				if (!date) return false;
				if (v === "overdue") return !isDone(task) && date < today;
				if (v === "today") return date === today;
				if (v === "tomorrow") return date === daysAfter(today, 1);
				return v === "week" && date >= today && date <= daysAfter(today, 7);
			});
		}
	}
}

function matchesChip(
	state: ChatState,
	task: Task,
	chip: TaskFilterChip,
	today: string,
): boolean {
	if (!chip.values.length) return true;
	if (chip.op === "all")
		return chip.values.every((v) =>
			matchesAny(state, task, chip.property, [v], today),
		);
	const any = matchesAny(state, task, chip.property, chip.values, today);
	return chip.op === "is" ? any : !any;
}

/** The tasks every chip keeps (chips AND; a chip's values OR), in their order. */
export const filterByChips = (
	state: ChatState,
	tasks: Task[],
	chips: TaskFilterChip[],
	today: string,
): Task[] =>
	tasks.filter((t) => chips.every((c) => matchesChip(state, t, c, today)));

const byDate = (a: Task, b: Task) => {
	const [x, y] = [taskDate(a), taskDate(b)];
	if (x !== y) return !x ? 1 : !y ? -1 : x < y ? -1 : 1;
	return a.createdAt.localeCompare(b.createdAt);
};

const ORDER: Record<TaskOrdering, (a: Task, b: Task) => number> = {
	due: byDate,
	created: (a, b) => b.createdAt.localeCompare(a.createdAt),
	title: (a, b) => a.title.localeCompare(b.title),
};

export const orderTasks = (tasks: Task[], by: TaskOrdering): Task[] =>
	[...tasks].sort(ORDER[by]);

export interface TaskGroup {
	key: string;
	label: string;
	/** For a status group: the status, so a heading shows its ring. */
	status?: TaskStatus;
	tasks: Task[];
}

const DUE_GROUPS: { key: string; label: string }[] = [
	{ key: "overdue", label: "Overdue" },
	{ key: "today", label: "Today" },
	{ key: "upcoming", label: "Upcoming" },
	{ key: "none", label: "No date" },
	{ key: "done", label: "Done" },
];

function dueGroupKey(task: Task, today: string): string {
	if (isDone(task)) return "done";
	const date = taskDate(task);
	return !date
		? "none"
		: date < today
			? "overdue"
			: date === today
				? "today"
				: "upcoming";
}

/**
 * Tasks in the groups a view shows, each in `orderBy` order. Statuses, due groups and `none` keep their fixed order;
 * labels, assignees and chats go by size, with the tasks that have none (a task with several labels shows under each) last.
 * Status groups all appear, so a board has its columns; the others leave out empty groups.
 */
export function groupTasks(
	state: ChatState,
	tasks: Task[],
	spec: Pick<TaskViewSpec, "groupBy" | "orderBy">,
	today: string,
): TaskGroup[] {
	const ordered = orderTasks(tasks, spec.orderBy);
	const dynamic = (
		keysOf: (t: Task) => { key: string; label: string }[],
		emptyLabel: string,
	): TaskGroup[] => {
		const groups = new Map<string, TaskGroup>();
		const none: Task[] = [];
		for (const t of ordered) {
			const keys = keysOf(t);
			if (!keys.length) none.push(t);
			for (const { key, label } of keys) {
				const g = groups.get(key) ?? { key, label, tasks: [] };
				g.tasks.push(t);
				groups.set(key, g);
			}
		}
		const list = [...groups.values()].sort(
			(a, b) =>
				b.tasks.length - a.tasks.length || a.label.localeCompare(b.label),
		);
		return none.length
			? [...list, { key: "none", label: emptyLabel, tasks: none }]
			: list;
	};
	switch (spec.groupBy) {
		case "none":
			return ordered.length
				? [{ key: "all", label: "Tasks", tasks: ordered }]
				: [];
		case "status":
			return TASK_STATUSES.map((s) => ({
				key: s,
				label: TASK_STATUS_LABEL[s],
				status: s,
				tasks: ordered.filter((t) => t.status === s),
			}));
		case "due":
			return DUE_GROUPS.map((g) => ({
				...g,
				tasks: ordered.filter((t) => dueGroupKey(t, today) === g.key),
			})).filter((g) => g.tasks.length);
		case "label":
			return dynamic(
				(t) =>
					taskLabels(t).map((name) => ({ key: lowerLabel(name), label: name })),
				"No label",
			);
		case "chat":
			return dynamic((t) => {
				const chat = state.chats.find((c) => c.id === t.chatId);
				return [
					{ key: t.chatId, label: chat ? chatTitle(state, chat) : "Chat" },
				];
			}, "No chat");
		case "assignee":
			return dynamic((t) => {
				if (t.assigneeDevId)
					return [
						{
							key: `dev:${t.assigneeDevId}`,
							label: state.devs[t.assigneeDevId]?.name ?? "Dev",
						},
					];
				if (t.assigneeId)
					return [
						{
							key: `user:${t.assigneeId}`,
							label:
								t.assigneeId === state.meId
									? "You"
									: (state.members[t.assigneeId]?.name ?? "Someone"),
						},
					];
				return [];
			}, "Unassigned");
	}
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
	typeof v === "string" && (list as readonly string[]).includes(v);

function parseChip(raw: unknown): TaskFilterChip | null {
	if (!raw || typeof raw !== "object") return null;
	const { property, op, values } = raw as Record<string, unknown>;
	if (
		!isOneOf(FILTER_PROPERTIES, property) ||
		!isOneOf(["is", "is_not", "all"] as const, op)
	)
		return null;
	if (!Array.isArray(values) || !values.every((v) => typeof v === "string"))
		return null;
	// "Needs review" is gone: a view that named it means the tasks it became, in progress.
	const read =
		property === "status"
			? [
					...new Set(
						values.map((v) => (v === "needs_review" ? "in_progress" : v)),
					),
				]
			: values;
	return { property, op, values: read.slice(0, 50) };
}

/** A stored spec read back; anything unreadable falls back to All tasks' choice for that part. */
export function parseViewSpec(raw: unknown): TaskViewSpec {
	const o = (raw && typeof raw === "object" ? raw : {}) as Record<
		string,
		unknown
	>;
	return {
		filters: Array.isArray(o.filters)
			? o.filters.flatMap((c) => parseChip(c) ?? [])
			: ALL_TASKS_VIEW.filters,
		groupBy: isOneOf(GROUPINGS, o.groupBy) ? o.groupBy : ALL_TASKS_VIEW.groupBy,
		orderBy: isOneOf(ORDERINGS, o.orderBy) ? o.orderBy : ALL_TASKS_VIEW.orderBy,
		layout: o.layout === "board" ? "board" : "list",
	};
}

/** Saved views read back from storage: the ones with an id and a name, each spec cleaned. */
export function parseSavedViews(raw: unknown): SavedTaskView[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((v): SavedTaskView[] => {
		if (!v || typeof v !== "object") return [];
		const { id, name } = v as Record<string, unknown>;
		return typeof id === "string" && typeof name === "string" && name.trim()
			? [{ id, name: name.trim().slice(0, 60), ...parseViewSpec(v) }]
			: [];
	});
}

export const sameSpec = (a: TaskViewSpec, b: TaskViewSpec) =>
	JSON.stringify(a) === JSON.stringify(b);

// Labels match in any case (`matchesAny`), so "Linear" and "linear" are the same value.
const valueKey = (property: FilterProperty, v: string) =>
	property === "label" ? lowerLabel(v) : v;

const sameChip = (a: TaskFilterChip, b: TaskFilterChip) => {
	if (
		a.property !== b.property ||
		a.op !== b.op ||
		a.values.length !== b.values.length
	)
		return false;
	const keys = b.values.map((v) => valueKey(b.property, v));
	return a.values.every((v) => keys.includes(valueKey(a.property, v)));
};

/** Whether a chip differs from every chip the saved view has (a new property, another op, other values), so a changed view can mark it. */
export const chipChanged = (
	chip: TaskFilterChip,
	saved: TaskFilterChip[],
): boolean => !saved.some((s) => sameChip(s, chip));

/** The filters with one property put back as the saved view has it (or taken off, if it has none): undoing one change. */
export function revertChip(
	filters: TaskFilterChip[],
	saved: TaskFilterChip[],
	property: FilterProperty,
): TaskFilterChip[] {
	const back = saved.filter((c) => c.property === property);
	const at = filters.findIndex((c) => c.property === property);
	const rest = filters.filter((c) => c.property !== property);
	if (at < 0) return [...rest, ...back];
	return [...rest.slice(0, at), ...back, ...rest.slice(at)];
}

/**
 * What a view's filters or grouping already say about every row it lists, so the rows needn't repeat it eleven times:
 * one chat or one assignee (`is` a single one, or grouped by it), the labels every row must carry (`is` one, or
 * `all`), lowercased, and a due date pinned to today (a row with a time, reminder or repeat still shows its chip).
 */
export interface ViewPins {
	chat: boolean;
	assignee: boolean;
	labels: string[];
	dueToday: boolean;
}

export function viewPins(
	spec: Pick<TaskViewSpec, "filters" | "groupBy">,
): ViewPins {
	// Chips AND, so any one that keeps a single value pins it (and two that disagree show nothing at all).
	const single = (property: FilterProperty) =>
		spec.filters
			.filter(
				(c) =>
					c.property === property && c.op === "is" && c.values.length === 1,
			)
			.map((c) => c.values[0]!);
	// "devs" and "none" don't name one assignee: the first still differs by row, the second shows nothing anyway.
	const assignee = single("assignee").some((v) => v !== "devs" && v !== "none");
	const labels = spec.filters.flatMap((c) =>
		c.property === "label" &&
		(c.op === "all" || (c.op === "is" && c.values.length === 1))
			? c.values
			: [],
	);
	return {
		chat: spec.groupBy === "chat" || single("chat").length > 0,
		assignee: spec.groupBy === "assignee" || assignee,
		labels: [...new Set(labels.map(lowerLabel))],
		dueToday: single("due").includes("today"),
	};
}

/** The tasks whose title or description holds every word of the query, in any case; all of them for a blank one. */
export function searchTasks<T extends Pick<Task, "title" | "description">>(
	tasks: T[],
	query: string,
): T[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return tasks;
	return tasks.filter((t) => {
		const text = `${t.title}\n${t.description}`.toLowerCase();
		return words.every((w) => text.includes(w));
	});
}

/** How tall a task list's rows are, each device's own choice (not a view's): the full row, or one line. */
export type TaskRows = "full" | "compact";

export const TASK_ROWS: readonly TaskRows[] = ["full", "compact"];

export const TASK_ROWS_LABEL: Record<TaskRows, string> = {
	full: "Full size",
	compact: "Compact",
};
