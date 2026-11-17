import { expect, test } from "bun:test";
import type { Task } from "../model/model.ts";
import { taskSections } from "./task-sections.ts";

const task = (
	id: string,
	due: string | null,
	done = false,
	scheduledAt: string | null = null,
): Task => ({
	id,
	chatId: "c",
	title: id,
	description: "",
	status: done ? "done" : "todo",
	assigneeId: null,
	assigneeDevId: null,
	due,
	scheduledAt,
	remind: false,
	repeat: null,
	createdAt: "2026-10-01T00:00:00.000Z",
});

test("open tasks by due date, done last; empty sections are left out", () => {
	const tasks = [
		task("late", "2026-10-11"),
		task("now", "2026-10-12"),
		task("later", "2026-10-20"),
		task("whenever", null),
		task("old", "2026-10-01", true),
	];
	expect(
		taskSections(tasks, "2026-10-12").map((s) => [
			s.label,
			s.tasks.map((t) => t.id),
		]),
	).toEqual([
		["Overdue", ["late"]],
		["Today", ["now"]],
		["Upcoming", ["later"]],
		["No date", ["whenever"]],
		["Done", ["old"]],
	]);
	expect(
		taskSections([task("now", "2026-10-12")], "2026-10-12").map((s) => s.label),
	).toEqual(["Today"]);
});

test("a timed task falls on its local day", () => {
	const timed = task(
		"call",
		null,
		false,
		new Date(2026, 9, 12, 18, 30).toISOString(),
	);
	expect(taskSections([timed], "2026-10-12").map((s) => s.label)).toEqual([
		"Today",
	]);
});
