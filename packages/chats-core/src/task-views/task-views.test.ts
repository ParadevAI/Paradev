import { describe, expect, test } from "bun:test";
import type { ChatState, Task } from "../index.ts";
import {
	ALL_TASKS_VIEW,
	addLabel,
	BUILT_IN_VIEWS,
	chipChanged,
	filterByChips,
	groupTasks,
	labelCounts,
	OPEN_CHIP,
	parseSavedViews,
	parseViewSpec,
	removeLabel,
	revertChip,
	type SavedTaskView,
	searchTasks,
	type TaskFilterChip,
	type TaskGrouping,
	viewPins,
	viewSpecOf,
	viewTabs,
} from "./task-views.ts";

const task = (o: Partial<Task>): Task => ({
	id: "t",
	chatId: "me",
	title: "Task",
	description: "",
	status: "todo",
	assigneeId: null,
	assigneeDevId: null,
	due: null,
	scheduledAt: null,
	remind: false,
	repeat: null,
	createdAt: "2026-10-10T09:00:00.000Z",
	...o,
});

const state: ChatState = {
	meId: "u1",
	members: { u1: { id: "u1", name: "Alice" } },
	devs: {},
	chats: [
		{
			id: "me",
			title: "Me",
			kind: "group",
			memberIds: ["u1"],
			ownerIds: ["u1"],
			devIds: [],
		},
	],
	messages: [],
	tasks: [],
	apps: [],
};
const TODAY = "2026-10-10";

const a = task({
	id: "a",
	labels: ["Gmail", "Client"],
	assigneeId: "u1",
	due: "2026-10-09",
});
const b = task({
	id: "b",
	labels: ["gmail"],
	status: "done",
	due: "2026-10-10",
});
const c = task({
	id: "c",
	labels: ["Linear"],
	assigneeDevId: "m1",
	status: "in_progress",
});
const d = task({ id: "d" });
const all = [a, b, c, d];
const ids = (ts: Task[]) => ts.map((t) => t.id);

describe("filterByChips", () => {
	test("labels match in any case: is, is not and all", () => {
		expect(
			ids(
				filterByChips(
					state,
					all,
					[{ property: "label", op: "is", values: ["GMAIL", "linear"] }],
					TODAY,
				),
			),
		).toEqual(["a", "b", "c"]);
		expect(
			ids(
				filterByChips(
					state,
					all,
					[{ property: "label", op: "is_not", values: ["gmail"] }],
					TODAY,
				),
			),
		).toEqual(["c", "d"]);
		expect(
			ids(
				filterByChips(
					state,
					all,
					[{ property: "label", op: "all", values: ["gmail", "client"] }],
					TODAY,
				),
			),
		).toEqual(["a"]);
	});
	test("chips AND together", () => {
		const chips = [
			{ property: "status" as const, op: "is_not" as const, values: ["done"] },
			{ property: "assignee" as const, op: "is" as const, values: ["me"] },
		];
		expect(ids(filterByChips(state, all, chips, TODAY))).toEqual(["a"]);
	});
	test("assignee: devs, unassigned; due: overdue and none; a chip with no values keeps everything", () => {
		expect(
			ids(
				filterByChips(
					state,
					all,
					[{ property: "assignee", op: "is", values: ["devs"] }],
					TODAY,
				),
			),
		).toEqual(["c"]);
		expect(
			ids(
				filterByChips(
					state,
					all,
					[{ property: "assignee", op: "is", values: ["none"] }],
					TODAY,
				),
			),
		).toEqual(["b", "d"]);
		expect(
			ids(
				filterByChips(
					state,
					all,
					[{ property: "due", op: "is", values: ["overdue"] }],
					TODAY,
				),
			),
		).toEqual(["a"]);
		expect(
			ids(
				filterByChips(
					state,
					all,
					[{ property: "due", op: "is", values: ["none"] }],
					TODAY,
				),
			),
		).toEqual(["c", "d"]);
		expect(
			ids(
				filterByChips(
					state,
					all,
					[{ property: "due", op: "is", values: ["tomorrow"] }],
					"2026-10-09",
				),
			),
		).toEqual(["b"]);
		expect(
			filterByChips(
				state,
				all,
				[{ property: "label", op: "is", values: [] }],
				TODAY,
			),
		).toHaveLength(4);
	});
});

describe("groupTasks", () => {
	test("by status: every status, in order, even empty", () => {
		const groups = groupTasks(
			state,
			all,
			{ groupBy: "status", orderBy: "due" },
			TODAY,
		);
		expect(groups.map((g) => [g.key, g.tasks.length])).toEqual([
			["todo", 2],
			["in_progress", 1],
			["done", 1],
		]);
	});
	test("by label: a task with two labels shows under both, unlabelled last", () => {
		const groups = groupTasks(
			state,
			all,
			{ groupBy: "label", orderBy: "due" },
			TODAY,
		);
		expect(groups.map((g) => [g.label, ids(g.tasks)])).toEqual([
			["Gmail", ["a", "b"]],
			["Client", ["a"]],
			["Linear", ["c"]],
			["No label", ["d"]],
		]);
	});
	test("ordered by due date with undated last; none is one group", () => {
		expect(
			ids(
				groupTasks(state, all, { groupBy: "none", orderBy: "due" }, TODAY)[0]!
					.tasks,
			),
		).toEqual(["a", "b", "c", "d"]);
	});
});

test("labels: counts, add and remove ignore case", () => {
	expect(labelCounts(all)).toEqual([
		{ name: "Gmail", count: 2 },
		{ name: "Client", count: 1 },
		{ name: "Linear", count: 1 },
	]);
	expect(addLabel(["Gmail"], " gmail ")).toEqual(["Gmail"]);
	expect(addLabel(["Gmail"], "Client")).toEqual(["Gmail", "Client"]);
	expect(removeLabel(["Gmail", "Client"], "GMAIL")).toEqual(["Client"]);
});

test("stored views are cleaned", () => {
	expect(
		parseViewSpec({
			filters: [
				{ property: "nope", op: "is", values: [] },
				{ property: "label", op: "is", values: ["x"] },
			],
			groupBy: "x",
			layout: "board",
		}),
	).toEqual({
		filters: [{ property: "label", op: "is", values: ["x"] }],
		groupBy: "status",
		orderBy: "due",
		layout: "board",
	});
	expect(
		parseSavedViews([{ id: "1", name: " Mine " }, { id: "2" }, null]),
	).toHaveLength(1);
	expect(parseSavedViews("x")).toEqual([]);
	// "Needs review" is gone: a view that named it reads it as in progress.
	expect(
		parseViewSpec({
			filters: [
				{
					property: "status",
					op: "is",
					values: ["needs_review", "in_progress", "todo"],
				},
			],
		}).filters,
	).toEqual([
		{ property: "status", op: "is", values: ["in_progress", "todo"] },
	]);
});

test("the views row is the built-in views, then the saved ones; a gone view reads as All tasks", () => {
	const saved: SavedTaskView[] = [
		{ id: "v1", name: "Board", ...ALL_TASKS_VIEW, layout: "board" },
	];
	expect(viewTabs(saved).map((t) => [t.id, t.builtIn])).toEqual([
		["all", true],
		["mine", true],
		["v1", false],
	]);
	expect(viewSpecOf(saved, "v1").layout).toBe("board");
	expect(viewSpecOf(saved, "mine")).toEqual(BUILT_IN_VIEWS[1]!.spec);
	expect(viewSpecOf(saved, "gone")).toEqual(ALL_TASKS_VIEW);
});

describe("viewPins", () => {
	const spec = (
		filters: TaskFilterChip[],
		groupBy: TaskGrouping = "status",
	) => ({ filters, groupBy });

	test("a single chat, assignee, label and today are pinned", () => {
		const pins = viewPins(
			spec([
				{ property: "assignee", op: "is", values: ["me"] },
				{ property: "label", op: "is", values: ["Linear"] },
				{ property: "chat", op: "is", values: ["c1"] },
				{ property: "due", op: "is", values: ["today"] },
			]),
		);
		expect(pins).toEqual({
			chat: true,
			assignee: true,
			labels: ["linear"],
			dueToday: true,
		});
	});

	test("several values, is not, or assignees that differ by row pin nothing", () => {
		const pins = viewPins(
			spec([
				{ property: "assignee", op: "is", values: ["devs"] },
				{ property: "label", op: "is", values: ["a", "b"] },
				{ property: "chat", op: "is_not", values: ["c1"] },
				{ property: "due", op: "is", values: ["today", "overdue"] },
			]),
		);
		expect(pins).toEqual({
			chat: false,
			assignee: false,
			labels: [],
			dueToday: false,
		});
	});

	test("every chip that keeps one value pins it, not only the first", () => {
		const pins = viewPins(
			spec([
				{ property: "label", op: "is", values: ["a", "b"] },
				{ property: "label", op: "is", values: ["Linear"] },
				{ property: "assignee", op: "is", values: ["devs"] },
				{ property: "assignee", op: "is", values: ["dev:m1"] },
			]),
		);
		expect(pins.labels).toEqual(["linear"]);
		expect(pins.assignee).toBe(true);
	});

	test("every label of an all chip is pinned; grouping pins its field", () => {
		expect(
			viewPins(spec([{ property: "label", op: "all", values: ["A", "b"] }]))
				.labels,
		).toEqual(["a", "b"]);
		expect(viewPins(spec([], "chat")).chat).toBe(true);
		expect(viewPins(spec([], "assignee")).assignee).toBe(true);
		expect(viewPins(ALL_TASKS_VIEW)).toEqual({
			chat: false,
			assignee: false,
			labels: [],
			dueToday: false,
		});
	});
});

describe("chipChanged", () => {
	const saved: TaskFilterChip[] = [
		{ property: "label", op: "is", values: ["a", "b"] },
	];

	test("the same chip in any value order is unchanged", () => {
		expect(
			chipChanged({ property: "label", op: "is", values: ["b", "a"] }, saved),
		).toBe(false);
	});

	test("labels compare in any case, as they filter", () => {
		expect(
			chipChanged({ property: "label", op: "is", values: ["B", "A"] }, saved),
		).toBe(false);
		expect(
			chipChanged({ property: "chat", op: "is", values: ["C1"] }, [
				{ property: "chat", op: "is", values: ["c1"] },
			]),
		).toBe(true);
	});

	test("a new property, another op or other values is changed", () => {
		expect(
			chipChanged({ property: "chat", op: "is", values: ["a"] }, saved),
		).toBe(true);
		expect(
			chipChanged({ property: "label", op: "all", values: ["a", "b"] }, saved),
		).toBe(true);
		expect(
			chipChanged({ property: "label", op: "is", values: ["a"] }, saved),
		).toBe(true);
	});
});

describe("searchTasks", () => {
	const ferry = task({
		id: "f",
		title: "Book the ferry",
		description: "To **Havelock**, morning one",
	});
	const visa = task({ id: "v", title: "Visa photos" });

	test("every word, in the title or description, any case", () => {
		expect(ids(searchTasks([ferry, visa], "havelock BOOK"))).toEqual(["f"]);
		expect(ids(searchTasks([ferry, visa], "ferry visa"))).toEqual([]);
	});

	test("a blank query keeps them all", () => {
		expect(ids(searchTasks([ferry, visa], "  "))).toEqual(["f", "v"]);
	});
});

describe("revertChip", () => {
	const saved: TaskFilterChip[] = [
		OPEN_CHIP,
		{ property: "label", op: "is", values: ["a", "b"] },
	];

	test("puts a changed chip back as saved, in its place", () => {
		const draft: TaskFilterChip[] = [
			OPEN_CHIP,
			{ property: "label", op: "is", values: ["a"] },
			{ property: "chat", op: "is", values: ["c"] },
		];
		expect(revertChip(draft, saved, "label")).toEqual([
			OPEN_CHIP,
			saved[1]!,
			{ property: "chat", op: "is", values: ["c"] },
		]);
	});

	test("takes off a chip the saved view doesn't have", () => {
		expect(
			revertChip(
				[...saved, { property: "chat", op: "is", values: ["c"] }],
				saved,
				"chat",
			),
		).toEqual(saved);
	});
});
