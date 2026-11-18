import { expect, test } from "bun:test";
import { scheduleFields, scheduleOf } from "./taskSchedule";

const now = new Date(2026, 10, 17, 8, 0);

test("a date alone is a due date, and a time makes it a timed task", () => {
	expect(
		scheduleOf({ date: "2026-11-20", time: "", remind: true }, now, "UTC"),
	).toEqual({
		due: "2026-11-20",
		scheduledAt: null,
		remind: false,
		repeat: null,
	});
	const timed = scheduleOf(
		{ date: "2026-11-20", time: "14:30", remind: true },
		now,
		"UTC",
	);
	expect(timed.due).toBeNull();
	expect(timed.remind).toBe(true);
	expect(scheduleFields(timed)).toEqual({
		date: "2026-11-20",
		time: "14:30",
		remind: true,
	});
});

test("a time without a date is today's", () => {
	const timed = scheduleOf(
		{ date: "", time: "09:15", remind: false },
		now,
		"UTC",
	);
	expect(new Date(timed.scheduledAt ?? "").getTime()).toBe(
		new Date(2026, 10, 17, 9, 15).getTime(),
	);
});
