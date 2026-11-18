import { describe, expect, it } from "bun:test";
import { usageRange } from "./usageRange";

describe("usageRange", () => {
	it("uses the period, and the last 30 days when there is none", () => {
		expect(usageRange({ id: "2026-11-01" })).toEqual({ period: "2026-11-01" });
		expect(usageRange(undefined)).toBe("30d");
	});
});
