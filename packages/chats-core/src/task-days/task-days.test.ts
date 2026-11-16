import { describe, expect, test } from "bun:test";
import type { Task } from "../model/model.ts";
import { dayLabel, taskDays } from "./task-days.ts";

const TODAY = "2026-10-15";
const task = (
	id: string,
	due: string | null,
	status: Task["status"] = "todo",
) => ({ id, due, scheduledAt: null, status }) as Task;

const tasks = [
	task("later", "2026-10-20"),
	task("none", null),
	task("today", TODAY),
	task("past1", "2026-10-12"),
	task("tomorrow", "2026-10-16"),
	task("past2", "2026-10-10"),
	task("done-today", TODAY, "done"),
	task("done-yesterday", "2026-10-14", "done"),
	task("done-none", null, "done"),
];

describe("taskDays", () => {
	test("to do: overdue together, then each day in order, undated last; nothing done", () => {
		expect(
			taskDays(tasks, TODAY, "todo").map((d) => [
				d.label,
				d.tasks.map((t) => t.id),
			]),
		).toEqual([
			["Overdue", ["past1", "past2"]],
			["Today", ["today"]],
			["Tomorrow", ["tomorrow"]],
			[dayLabel("2026-10-20", TODAY), ["later"]],
			["No date", ["none"]],
		]);
	});

	test("done: the latest day first, undated last; nothing to do", () => {
		expect(
			taskDays(tasks, TODAY, "done").map((d) => [
				d.label,
				d.tasks.map((t) => t.id),
			]),
		).toEqual([
			["Today", ["done-today"]],
			["Yesterday", ["done-yesterday"]],
			["No date", ["done-none"]],
		]);
	});
});

test("a day further off reads as its weekday and date", () => {
	expect(dayLabel("2026-10-20", TODAY)).toBe(
		new Date(2026, 9, 20).toLocaleDateString(undefined, {
			weekday: "short",
			day: "numeric",
			month: "short",
		}),
	);
});
