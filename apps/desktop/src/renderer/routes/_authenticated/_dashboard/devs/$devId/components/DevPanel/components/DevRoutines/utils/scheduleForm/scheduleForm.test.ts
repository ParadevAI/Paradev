import { describe, expect, test } from "bun:test";
import { formFromSchedule, scheduleFromForm } from "./scheduleForm";

const fallback = {
	now: new Date("2026-10-30T16:00:00Z"),
	timezone: "America/Los_Angeles",
};

describe("scheduleForm", () => {
	test("weekdays at 9 Pacific round-trips", () => {
		const schedule = {
			dtstart: "2026-10-30T16:00:00.000Z",
			rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
			timezone: "America/Los_Angeles",
		};
		const form = formFromSchedule(schedule, fallback);
		expect(form).toMatchObject({
			repeat: true,
			every: "weekdays",
			date: "2026-10-30",
			time: "09:00",
			endDate: null,
		});
		expect(scheduleFromForm(form)).toEqual(schedule);
	});

	test("a one-off keeps its moment across daylight saving", () => {
		const form = formFromSchedule(null, fallback);
		const later = { ...form, date: "2026-11-02", time: "09:00" };
		expect(scheduleFromForm(later)).toEqual({
			dtstart: "2026-11-02T17:00:00.000Z",
			rrule: null,
			timezone: "America/Los_Angeles",
		});
	});

	test("an end date becomes UNTIL at the end of that day and comes back", () => {
		const form = {
			...formFromSchedule(null, fallback),
			repeat: true,
			every: "daily" as const,
			time: "08:30",
			endDate: "2026-11-15",
		};
		const schedule = scheduleFromForm(form);
		expect(schedule.rrule).toBe(
			"FREQ=DAILY;BYHOUR=8;BYMINUTE=30;UNTIL=20261116T075900Z",
		);
		expect(formFromSchedule(schedule, fallback)).toMatchObject({
			every: "daily",
			endDate: "2026-11-15",
		});
	});

	test("a rule the picker can't show stays custom, as written", () => {
		const schedule = {
			dtstart: "2026-10-30T16:00:00.000Z",
			rrule: "FREQ=MONTHLY;BYDAY=1MO;BYHOUR=9;BYMINUTE=0",
			timezone: "America/Los_Angeles",
		};
		const form = formFromSchedule(schedule, fallback);
		expect(form.every).toBe("custom");
		expect(scheduleFromForm(form).rrule).toBe(schedule.rrule);
	});
});
