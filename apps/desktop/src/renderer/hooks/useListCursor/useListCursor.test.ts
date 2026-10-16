import { describe, expect, test } from "bun:test";
import { nextIndex } from "./useListCursor";

function walk(keys: string[], count: number): number[] {
	const seen: number[] = [];
	for (const key of keys) seen.push(nextIndex(seen.at(-1) ?? -1, key, count));
	return seen;
}

describe("nextIndex moves like Slack's pickers", () => {
	test("↓ reaches the first item, then steps, then rests past the end", () => {
		expect(
			walk(
				["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown"],
				3,
			),
		).toEqual([0, 1, 2, -1, 0]);
	});
	test("↑ from rest goes to the last item", () => {
		expect(walk(["ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp"], 3)).toEqual([
			2, 1, 0, -1,
		]);
	});
});
