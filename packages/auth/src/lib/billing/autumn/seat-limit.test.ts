import { describe, expect, test } from "bun:test";
import { planSeatRefusal, seatLimitRefusal } from "./seat-limit";

describe("seatLimitRefusal", () => {
	test("refuses when the cap is unknown", () => {
		expect(seatLimitRefusal(null, 0)).toContain("could not confirm");
	});

	test("allows the last seat and refuses the one after", () => {
		expect(seatLimitRefusal(5, 4)).toBeNull();
		expect(seatLimitRefusal(5, 5)).toContain("up to 5 members");
	});
});

describe("planSeatRefusal", () => {
	test("allows an organization exactly at the cap", () => {
		expect(planSeatRefusal(5, 5)).toBeNull();
	});

	test("refuses an organization above the cap", () => {
		expect(planSeatRefusal(5, 6)).toContain("has 6");
	});

	test("refuses a plan with no declared cap", () => {
		expect(planSeatRefusal(null, 1)).toContain("could not confirm");
	});
});
