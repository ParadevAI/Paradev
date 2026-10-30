import { describe, expect, it } from "bun:test";
import { diffStatsDecoration } from "./diffStatsDecoration";

describe("diffStatsDecoration", () => {
	it("colors additions and deletions separately", () => {
		const decoration = diffStatsDecoration(5, 2);
		expect(decoration?.text).toBe("+5 −2");
		expect(decoration?.parts?.map((part) => part.text)).toEqual([
			"+5",
			"\u00a0",
			"−2",
		]);
		expect(decoration?.parts?.[0]?.color).toContain("green");
		expect(decoration?.parts?.at(-1)?.color).toContain("red");
	});

	it("returns nothing when there are no changes", () => {
		expect(diffStatsDecoration(0, 0)).toBeNull();
		expect(diffStatsDecoration(null, 3)).toBeNull();
	});
});
