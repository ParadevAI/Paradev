import { describe, expect, test } from "bun:test";
import { dueQuickPicks, taskDate, taskWhen } from "./task-time.ts";

// Thursday 8 October 2026, 10:00 local time.
const now = new Date(2026, 9, 8, 10, 0);
const at = (d: number, h: number, m = 0) =>
	new Date(2026, 9, d, h, m).toISOString();
const task = {
	due: null,
	scheduledAt: null,
	remind: false,
	assigneeDevId: "m1",
	status: "todo" as const,
};

describe("taskWhen", () => {
	test("no date, no chip", () => {
		expect(taskWhen(task, now)).toBeNull();
	});

	test("date-only tasks keep the day's word", () => {
		expect(taskWhen({ ...task, due: "2026-10-08" }, now)).toEqual({
			label: "Today",
			tone: "today",
			reminder: false,
		});
		expect(taskWhen({ ...task, due: "2026-10-07" }, now)?.tone).toBe("overdue");
		expect(
			taskWhen({ ...task, due: "2026-10-07", status: "done" }, now)?.tone,
		).toBe("later");
	});

	test("timed tasks: soon within two hours, overdue once past", () => {
		expect(taskWhen({ ...task, scheduledAt: at(8, 11) }, now)).toMatchObject({
			tone: "soon",
			reminder: false,
		});
		expect(
			taskWhen({ ...task, scheduledAt: at(8, 11) }, now)?.label,
		).toStartWith("Today ");
		expect(taskWhen({ ...task, scheduledAt: at(8, 15) }, now)?.tone).toBe(
			"today",
		);
		expect(
			taskWhen({ ...task, scheduledAt: at(9, 10) }, now)?.label,
		).toStartWith("Tomorrow ");
		expect(taskWhen({ ...task, scheduledAt: at(8, 9) }, now)?.tone).toBe(
			"overdue",
		);
	});

	test("a person's time, or remind, is a reminder", () => {
		expect(
			taskWhen({ ...task, assigneeDevId: null, scheduledAt: at(9, 10) }, now)
				?.reminder,
		).toBe(true);
		expect(
			taskWhen({ ...task, remind: true, scheduledAt: at(9, 10) }, now)
				?.reminder,
		).toBe(true);
	});

	test("a timed task's date is its local day", () => {
		expect(taskDate({ due: null, scheduledAt: at(9, 23, 30) })).toBe(
			"2026-10-09",
		);
		expect(taskDate({ due: "2026-10-12", scheduledAt: null })).toBe(
			"2026-10-12",
		);
	});
});

describe("dueQuickPicks", () => {
	test("today, tomorrow and the coming Monday", () => {
		expect(dueQuickPicks(now).map((p) => p.date)).toEqual([
			"2026-10-08",
			"2026-10-09",
			"2026-10-12",
		]);
	});

	test("on a Monday, next week is a week away", () => {
		expect(dueQuickPicks(new Date(2026, 9, 12, 10, 0)).at(-1)?.date).toBe(
			"2026-10-19",
		);
	});
});
