import { describe, expect, test } from "bun:test";
import {
	daySegment,
	minuteOfDay,
	overlaps,
	shiftSpan,
	snapMinute,
	spanAt,
	windowDays,
	zonedInstant,
} from "./zoneTime";

const LA = "America/Los_Angeles";
const iso = (instant: number) => new Date(instant).toISOString();

describe("zonedInstant", () => {
	test("reads a wall-clock time in the view's zone, not the machine's", () => {
		expect(iso(zonedInstant({ year: 2026, month: 10, day: 6 }, 600, LA))).toBe(
			"2026-10-06T17:00:00.000Z",
		);
		expect(
			iso(zonedInstant({ year: 2026, month: 10, day: 6 }, 600, "Asia/Kolkata")),
		).toBe("2026-10-06T04:30:00.000Z");
	});

	test("the day the clocks go back has both offsets", () => {
		const day = { year: 2026, month: 11, day: 1 };
		expect(iso(zonedInstant(day, 0, LA))).toBe("2026-11-01T07:00:00.000Z");
		expect(iso(zonedInstant(day, 180, LA))).toBe("2026-11-01T11:00:00.000Z");
	});

	test("the day the clocks go forward has both offsets", () => {
		const day = { year: 2026, month: 3, day: 8 };
		expect(iso(zonedInstant(day, 60, LA))).toBe("2026-03-08T09:00:00.000Z");
		expect(iso(zonedInstant(day, 180, LA))).toBe("2026-03-08T10:00:00.000Z");
	});
});

describe("windowDays", () => {
	test("lists the zone's days and stops before an end at midnight", () => {
		const days = windowDays(
			{ start: "2026-10-05T07:00:00Z", end: "2026-10-10T07:00:00Z" },
			LA,
		);
		expect(days.map((d) => d.day)).toEqual([5, 6, 7, 8, 9]);
	});

	test("never returns more than seven days", () => {
		const days = windowDays(
			{ start: "2026-10-05T07:00:00Z", end: "2026-10-25T07:00:00Z" },
			LA,
		);
		expect(days).toHaveLength(7);
	});

	test("a week across the clock change is still seven days", () => {
		const days = windowDays(
			{ start: "2026-10-29T07:00:00Z", end: "2026-11-05T08:00:00Z" },
			LA,
		);
		expect(days.map((d) => d.day)).toEqual([29, 30, 31, 1, 2, 3, 4]);
	});
});

describe("snapMinute", () => {
	test("goes down to the quarter hour and stays inside the day", () => {
		expect(snapMinute(607)).toBe(600);
		expect(snapMinute(614.9)).toBe(600);
		expect(snapMinute(615)).toBe(615);
		expect(snapMinute(-20)).toBe(0);
		expect(snapMinute(1439)).toBe(1425);
	});
});

describe("spans", () => {
	test("spanAt keeps the real length across the clock change", () => {
		const span = spanAt({ year: 2026, month: 11, day: 1 }, 30, 120, LA);
		expect(span).toEqual({
			start: "2026-11-01T07:30:00.000Z",
			end: "2026-11-01T09:30:00.000Z",
		});
		expect(minuteOfDay(Date.parse(span.end), LA)).toBe(90);
	});

	test("a span over midnight has a segment on each day", () => {
		const span = spanAt(
			{ year: 2026, month: 10, day: 6 },
			23 * 60 + 30,
			60,
			LA,
		);
		expect(daySegment(span, { year: 2026, month: 10, day: 6 }, LA)).toEqual({
			from: 1410,
			to: 1440,
		});
		expect(daySegment(span, { year: 2026, month: 10, day: 7 }, LA)).toEqual({
			from: 0,
			to: 30,
		});
		expect(daySegment(span, { year: 2026, month: 10, day: 8 }, LA)).toBeNull();
	});

	test("shiftSpan moves both ends", () => {
		expect(
			shiftSpan(
				{ start: "2026-10-06T17:00:00.000Z", end: "2026-10-06T17:45:00.000Z" },
				-15,
			),
		).toEqual({
			start: "2026-10-06T16:45:00.000Z",
			end: "2026-10-06T17:30:00.000Z",
		});
	});

	test("spans that only touch do not overlap", () => {
		const a = { start: "2026-10-06T17:00:00Z", end: "2026-10-06T17:30:00Z" };
		expect(
			overlaps(a, {
				start: "2026-10-06T17:30:00Z",
				end: "2026-10-06T18:00:00Z",
			}),
		).toBe(false);
		expect(
			overlaps(a, {
				start: "2026-10-06T17:29:00Z",
				end: "2026-10-06T18:00:00Z",
			}),
		).toBe(true);
	});
});
