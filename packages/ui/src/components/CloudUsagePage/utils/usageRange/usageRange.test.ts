import { describe, expect, it } from "bun:test";
import { utcDays } from "../../components/UsageByDay/utils/utcDays";
import { usageRange } from "./usageRange";

describe("usageRange", () => {
	it("uses the period, and else the last 30 UTC days with today", () => {
		expect(usageRange({ id: "2026-11-01" })).toEqual({ period: "2026-11-01" });
		const range = usageRange(undefined, new Date("2026-11-18T15:30:00Z"));
		expect(range).toEqual({
			from: "2026-10-20T00:00:00.000Z",
			to: "2026-11-19T00:00:00.000Z",
		});
		const days = utcDays({
			from: new Date("2026-10-20T00:00:00.000Z"),
			to: new Date("2026-11-19T00:00:00.000Z"),
		});
		expect(days).toHaveLength(30);
		expect(days.at(-1)).toBe("2026-11-18");
	});
});
