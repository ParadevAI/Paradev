import { describe, expect, test } from "bun:test";
import { billingDate, billingDayStart, billingDays } from "./billingDay";

describe("billing days", () => {
	test("a billing day starts at Pacific midnight on both sides of each daylight-saving change", () => {
		expect(
			["2026-03-08", "2026-03-09", "2026-11-01", "2026-11-02"].map((day) =>
				billingDayStart(day).toISOString(),
			),
		).toEqual([
			"2026-03-08T08:00:00.000Z",
			"2026-03-09T07:00:00.000Z",
			"2026-11-01T07:00:00.000Z",
			"2026-11-02T08:00:00.000Z",
		]);
	});

	test("an instant before Pacific midnight is still the day before", () => {
		expect(billingDate(new Date("2026-11-02T07:30:00Z"))).toBe("2026-11-01");
		expect(billingDate(new Date("2026-11-02T08:00:00Z"))).toBe("2026-11-02");
	});

	test("a window lists every billing day it touches, the long day once", () => {
		expect(
			billingDays({
				from: billingDayStart("2026-10-31"),
				to: billingDayStart("2026-11-03"),
			}),
		).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
		expect(
			billingDays({
				from: new Date("2026-11-10T14:00:00Z"),
				to: new Date("2026-11-12T14:00:00Z"),
			}),
		).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
	});
});
