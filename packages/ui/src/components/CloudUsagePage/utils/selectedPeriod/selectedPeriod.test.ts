import { describe, expect, it } from "bun:test";
import { selectedPeriod } from "./selectedPeriod";

const periods = [{ id: "2026-11-01" }, { id: "2026-10-01" }];

describe("selectedPeriod", () => {
	it("is the chosen period, else the newest", () => {
		expect(selectedPeriod(periods, "2026-10-01")).toBe(periods[1]);
		expect(selectedPeriod(periods, undefined)).toBe(periods[0]);
		expect(selectedPeriod(periods, "2025-01-01")).toBe(periods[0]);
		expect(selectedPeriod(undefined, undefined)).toBeUndefined();
	});
});
