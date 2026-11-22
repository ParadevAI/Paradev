import { describe, expect, it } from "bun:test";
import { hasUsage } from "./hasUsage";

describe("hasUsage", () => {
	it("is true while the workspaces are not counted", () => {
		expect(hasUsage({ gbHours: 0, boots: 0, workspaces: null })).toBe(true);
	});

	it("is false only when nothing ran, booted or failed", () => {
		expect(hasUsage({ gbHours: 0, boots: 0, workspaces: 0 })).toBe(false);
		expect(hasUsage({ gbHours: 0, boots: 0, workspaces: 1 })).toBe(true);
		expect(hasUsage({ gbHours: 0, boots: 1, workspaces: 0 })).toBe(true);
		expect(hasUsage({ gbHours: 0.01, boots: 0, workspaces: 0 })).toBe(true);
	});
});
