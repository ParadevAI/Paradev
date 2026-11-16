import { describe, expect, test } from "bun:test";
import { firstRepeatDay } from "./repeat-start.ts";

// Tuesday 13 October 2026, 10:00.
const now = { date: "2026-10-13", time: { hour: 10, minute: 0 } };
const at = (hour: number, minute = 0) => ({ hour, minute });
const first = (rrule: string, time = at(9), from = now.date, when = now) =>
	firstRepeatDay(rrule, from, time, when);

describe("firstRepeatDay", () => {
	test("a weekly day rule starts on its next matching day", () => {
		expect(first("FREQ=WEEKLY;BYDAY=MO")).toBe("2026-10-19");
		expect(first("FREQ=WEEKLY;BYDAY=FR", at(18))).toBe("2026-10-16");
		expect(first("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR")).toBe("2026-10-16");
		expect(first("FREQ=WEEKLY;BYDAY=MO,TH")).toBe("2026-10-15");
	});

	test("a matching day whose time has passed moves on to the next match; one still ahead is kept", () => {
		expect(first("FREQ=WEEKLY;BYDAY=TU")).toBe("2026-10-20");
		expect(first("FREQ=WEEKLY;BYDAY=TU", at(10))).toBe("2026-10-20");
		expect(first("FREQ=WEEKLY;BYDAY=TU", at(18))).toBe("2026-10-13");
		expect(first("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("2026-10-14");
	});

	test("weekdays from a weekend start on Monday; weekends from a weekday on Saturday", () => {
		const saturday = { date: "2026-10-17", time: at(8) };
		expect(
			first("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", at(9), saturday.date, saturday),
		).toBe("2026-10-19");
		expect(first("FREQ=WEEKLY;BYDAY=SA,SU")).toBe("2026-10-17");
	});

	test("without days, a passed time moves on by the rule's own period, keeping its day", () => {
		expect(first("FREQ=DAILY")).toBe("2026-10-14");
		expect(first("FREQ=DAILY", at(18))).toBe("2026-10-13");
		expect(first("FREQ=DAILY;INTERVAL=3")).toBe("2026-10-16");
		expect(first("FREQ=WEEKLY")).toBe("2026-10-20");
		expect(first("FREQ=WEEKLY;INTERVAL=2")).toBe("2026-10-27");
		expect(first("FREQ=MONTHLY")).toBe("2026-11-13");
		expect(first("FREQ=YEARLY")).toBe("2027-10-13");
		expect(first("FREQ=MONTHLY", at(9), "2026-08-31", now)).toBe("2026-10-31");
		expect(first("FREQ=YEARLY", at(9), "2024-02-29", now)).toBe("2028-02-29");
	});

	test("a future start date is kept when the rule allows it, else moves to the rule's next day", () => {
		expect(first("FREQ=MONTHLY", at(9), "2026-11-01")).toBe("2026-11-01");
		expect(first("FREQ=WEEKLY;BYDAY=MO", at(9), "2026-10-21")).toBe(
			"2026-10-26",
		);
	});

	test("rules it can't step keep the start date", () => {
		expect(first("FREQ=MONTHLY;BYMONTHDAY=1")).toBe("2026-10-13");
		expect(first("FREQ=MONTHLY;BYDAY=1MO")).toBe("2026-10-13");
		expect(first("FREQ=HOURLY")).toBe("2026-10-13");
	});
});
