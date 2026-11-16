import { describe, expect, test } from "bun:test";
import {
	describeRepeat,
	isSubDaily,
	parseRepeat,
	parseTimeOfDay,
	repeatsTooOften,
} from "./repeat-rule.ts";

describe("parseRepeat", () => {
	test.each([
		["daily", "FREQ=DAILY", null],
		["every day at 8am", "FREQ=DAILY", { hour: 8, minute: 0 }],
		[
			"every weekday at 9",
			"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
			{ hour: 9, minute: 0 },
		],
		["weekdays", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", null],
		["every weekend", "FREQ=WEEKLY;BYDAY=SA,SU", null],
		["every monday", "FREQ=WEEKLY;BYDAY=MO", null],
		[
			"every thu and mon at 18:30",
			"FREQ=WEEKLY;BYDAY=MO,TH",
			{ hour: 18, minute: 30 },
		],
		["every fri, wed 7pm", "FREQ=WEEKLY;BYDAY=WE,FR", { hour: 19, minute: 0 }],
		["every 2 weeks on friday", "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR", null],
		["every other day", "FREQ=DAILY;INTERVAL=2", null],
		["every 2 minutes", "FREQ=MINUTELY;INTERVAL=2", null],
		["every hour", "FREQ=HOURLY", null],
		["monthly", "FREQ=MONTHLY", null],
	])("%s", (text, rrule, time) => {
		expect(parseRepeat(text)).toEqual({ rrule, time });
	});

	test("takes a raw RFC 5545 rule, with or without its prefix", () => {
		expect(parseRepeat("RRULE:freq=monthly;bymonthday=1")).toEqual({
			rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
			time: null,
		});
		expect(parseRepeat("FREQ=WEEKLY;BYDAY=MO;COUNT=4")?.rrule).toBe(
			"FREQ=WEEKLY;BYDAY=MO;COUNT=4",
		);
	});

	test("rejects what isn't a repeat", () => {
		for (const text of [
			"every",
			"every banana",
			"every 2 weekdays",
			"every day at lunch",
			"weekly on",
			"FREQ=DAILY;BAD",
			"tomorrow",
		]) {
			expect(parseRepeat(text)).toBeNull();
		}
	});
});

describe("parseTimeOfDay", () => {
	test("12-hour, 24-hour and words", () => {
		expect(parseTimeOfDay("9")).toEqual({ hour: 9, minute: 0 });
		expect(parseTimeOfDay("9.30pm")).toEqual({ hour: 21, minute: 30 });
		expect(parseTimeOfDay("12am")).toEqual({ hour: 0, minute: 0 });
		expect(parseTimeOfDay("12pm")).toEqual({ hour: 12, minute: 0 });
		expect(parseTimeOfDay("noon")).toEqual({ hour: 12, minute: 0 });
		expect(parseTimeOfDay("25")).toBeNull();
		expect(parseTimeOfDay("13pm")).toBeNull();
	});
});

describe("describeRepeat", () => {
	test("words for the rules people write", () => {
		expect(
			describeRepeat("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", {
				hour: 9,
				minute: 0,
			}),
		).toBe("Every weekday at 09:00");
		expect(
			describeRepeat("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR", {
				hour: 18,
				minute: 30,
			}),
		).toBe("Every 2 weeks on Friday at 18:30");
		expect(describeRepeat("FREQ=WEEKLY;BYDAY=MO,WE,FR", null)).toBe(
			"Every Monday, Wednesday and Friday",
		);
		expect(describeRepeat("FREQ=DAILY", { hour: 8, minute: 5 })).toBe(
			"Every day at 08:05",
		);
		expect(
			describeRepeat("FREQ=MINUTELY;INTERVAL=2", { hour: 8, minute: 5 }),
		).toBe("Every 2 minutes");
		expect(describeRepeat("FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR", null)).toBe(
			"Repeats (custom)",
		);
	});

	test("sub-daily rules", () => {
		expect(isSubDaily("FREQ=MINUTELY;INTERVAL=2")).toBe(true);
		expect(isSubDaily("FREQ=DAILY")).toBe(false);
	});
});

describe("repeatsTooOften", () => {
	test("by the second or minute under an hour; the floor can be lowered for tests", () => {
		expect(repeatsTooOften("FREQ=SECONDLY;INTERVAL=30")).toBe(true);
		expect(repeatsTooOften("FREQ=SECONDLY;INTERVAL=3600")).toBe(false);
		expect(repeatsTooOften("FREQ=MINUTELY;INTERVAL=59")).toBe(true);
		expect(repeatsTooOften("FREQ=MINUTELY;INTERVAL=60")).toBe(false);
		expect(repeatsTooOften("FREQ=HOURLY")).toBe(false);
		expect(repeatsTooOften("FREQ=DAILY")).toBe(false);
		expect(repeatsTooOften("FREQ=MINUTELY;INTERVAL=2", 1)).toBe(false);
	});
});
