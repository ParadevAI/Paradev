import { describe, expect, test } from "bun:test";
import { OPEN_CHIP, type TaskFilterChip } from "../task-views/task-views.ts";
import {
	chipValueText,
	opsFor,
	shownStatuses,
	showsDone,
	toggleChipValue,
	toggleShownStatus,
	withDone,
} from "./task-filter-options.ts";

test("picking a value adds a chip, adds to it, and removes the chip when its last value goes", () => {
	const one = toggleChipValue([], "label", "Gmail");
	expect(one).toEqual([{ property: "label", op: "is", values: ["Gmail"] }]);
	const two = toggleChipValue(one, "label", "Linear");
	expect(two[0]!.values).toEqual(["Gmail", "Linear"]);
	expect(toggleChipValue(two, "label", "gmail")[0]!.values).toEqual(["Linear"]);
	expect(toggleChipValue(one, "label", "GMAIL")).toEqual([]);
});

test("a chip's values read short", () => {
	const options = [{ value: "me", label: "Me" }];
	expect(
		chipValueText(options, { property: "assignee", op: "is", values: ["me"] }),
	).toBe("Me");
	expect(
		chipValueText(options, {
			property: "label",
			op: "is",
			values: ["a", "b", "c"],
		}),
	).toBe("a +2");
	expect(
		chipValueText(options, { property: "label", op: "is", values: [] }),
	).toBe("…");
});

test("only labels can require all values", () => {
	expect(opsFor("label")).toContain("all");
	expect(opsFor("status")).not.toContain("all");
});

const label: TaskFilterChip = {
	property: "label",
	op: "is",
	values: ["Gmail"],
};
const status = (
	op: TaskFilterChip["op"],
	...values: string[]
): TaskFilterChip => ({ property: "status", op, values });

describe("showsDone", () => {
	test("is false while the status filter keeps Done out", () => {
		expect(showsDone([OPEN_CHIP, label])).toBe(false);
		expect(showsDone([status("is_not", "todo", "done")])).toBe(false);
		expect(showsDone([status("is", "todo")])).toBe(false);
	});

	test("is true when it lets Done through, or there's none", () => {
		expect(showsDone([label])).toBe(true);
		expect(showsDone([status("is", "done")])).toBe(true);
		expect(showsDone([status("is_not", "todo")])).toBe(true);
	});
});

describe("withDone", () => {
	test("showing takes the open filter out, or Done out of a wider one, or adds it to an `is`", () => {
		expect(withDone([OPEN_CHIP, label], true)).toEqual([label]);
		expect(withDone([status("is_not", "todo", "done")], true)).toEqual([
			status("is_not", "todo"),
		]);
		expect(withDone([status("is", "todo")], true)).toEqual([
			status("is", "todo", "done"),
		]);
	});

	test("hiding adds the open filter first, or changes the status filter in place", () => {
		expect(withDone([label], false)).toEqual([OPEN_CHIP, label]);
		expect(withDone([status("is_not", "todo"), label], false)).toEqual([
			status("is_not", "todo", "done"),
			label,
		]);
		expect(withDone([status("is", "done", "todo")], false)).toEqual([
			status("is", "todo"),
		]);
		expect(withDone([status("is", "done")], false)).toEqual([OPEN_CHIP]);
	});

	test("leaves filters that already agree as they are", () => {
		const hidden = [OPEN_CHIP, label];
		expect(withDone(hidden, false)).toBe(hidden);
	});
});

describe("the phone's status ticks", () => {
	const assignee: TaskFilterChip = {
		property: "assignee",
		op: "is",
		values: ["me"],
	};

	test("read what the status chip lets through", () => {
		expect(shownStatuses([])).toEqual(["todo", "in_progress", "done"]);
		expect(shownStatuses([OPEN_CHIP])).toEqual(["todo", "in_progress"]);
		expect(
			shownStatuses([{ property: "status", op: "is", values: ["done"] }]),
		).toEqual(["done"]);
	});

	test("ticking Done back on drops the chip, keeping the others where they were", () => {
		expect(toggleShownStatus([OPEN_CHIP, assignee], "done")).toEqual([
			assignee,
		]);
	});

	test("hiding one status writes “is not”, hiding more writes the ones shown", () => {
		expect(toggleShownStatus([assignee], "done")).toEqual([
			OPEN_CHIP,
			assignee,
		]);
		expect(toggleShownStatus([OPEN_CHIP, assignee], "todo")).toEqual([
			{ property: "status", op: "is", values: ["in_progress"] },
			assignee,
		]);
	});

	test("the last status shown stays", () => {
		const only: TaskFilterChip[] = [
			{ property: "status", op: "is", values: ["todo"] },
		];
		expect(toggleShownStatus(only, "todo")).toBe(only);
	});
});
