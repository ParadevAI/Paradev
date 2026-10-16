import { describe, expect, test } from "bun:test";
import { startOfZonedDay, zonedInstant, zonedParts } from "./calendarTime";

const LA = "America/Los_Angeles";

describe("zoned time", () => {
	test("reads an instant as the zone's wall clock", () => {
		expect(zonedParts(new Date("2026-10-06T17:00:00Z"), LA)).toEqual({
			year: 2026,
			month: 10,
			day: 6,
			hour: 10,
			minute: 0,
			weekday: 2,
		});
	});

	test("names the instant of a wall-clock time on either side of a clock change", () => {
		expect(
			zonedInstant(
				{ year: 2026, month: 10, day: 31, hour: 9, minute: 0 },
				LA,
			).toISOString(),
		).toBe("2026-10-31T16:00:00.000Z");
		expect(
			zonedInstant(
				{ year: 2026, month: 11, day: 2, hour: 9, minute: 0 },
				LA,
			).toISOString(),
		).toBe("2026-11-02T17:00:00.000Z");
	});

	test("a day that starts in summer time and ends in winter time is 25 hours long", () => {
		const start = startOfZonedDay(new Date("2026-11-01T12:00:00Z"), LA);
		const next = startOfZonedDay(new Date("2026-11-01T12:00:00Z"), LA, 1);
		expect(start.toISOString()).toBe("2026-11-01T07:00:00.000Z");
		expect((next.getTime() - start.getTime()) / 3_600_000).toBe(25);
	});

	test("a midnight the clock skips starts the day at the first moment after it, and days still advance", () => {
		for (const [zone, day] of [
			["Asia/Beirut", "2026-03-28T12:00:00Z"],
			["Africa/Cairo", "2026-04-23T12:00:00Z"],
		] as const) {
			const today = startOfZonedDay(new Date(day), zone);
			const next = startOfZonedDay(new Date(day), zone, 1);
			const after = startOfZonedDay(new Date(day), zone, 2);
			expect(next.getTime()).toBeGreaterThan(today.getTime());
			expect(after.getTime()).toBeGreaterThan(next.getTime());
			expect(zonedParts(next, zone).hour).toBe(1);
			expect(zonedParts(next, zone).day).toBe(zonedParts(today, zone).day + 1);
		}
	});

	test("adding days rolls over the month", () => {
		expect(
			startOfZonedDay(new Date("2026-10-31T20:00:00Z"), LA, 1).toISOString(),
		).toBe("2026-11-01T07:00:00.000Z");
	});
});
