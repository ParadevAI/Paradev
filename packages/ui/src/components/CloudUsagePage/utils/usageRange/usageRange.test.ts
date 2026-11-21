import { describe, expect, it } from "bun:test";
import { billingDays } from "../billingDay";
import { usageRange } from "./usageRange";

describe("usageRange", () => {
	it("uses the period, and else the last 30 billing days with today", () => {
		expect(usageRange({ id: "2026-11-01" })).toEqual({ period: "2026-11-01" });
		const range = usageRange(undefined, new Date("2026-11-18T15:30:00Z"));
		expect(range).toEqual({
			from: "2026-10-20T07:00:00.000Z",
			to: "2026-11-19T08:00:00.000Z",
		});
		const days = billingDays({
			from: new Date(range.from as string),
			to: new Date(range.to as string),
		});
		expect(days).toHaveLength(30);
		expect(days.at(-1)).toBe("2026-11-18");
	});

	it("an evening in California is still that Pacific day", () => {
		const range = usageRange(undefined, new Date("2026-11-19T06:00:00Z"));
		expect(range.to).toBe("2026-11-19T08:00:00.000Z");
	});
});
