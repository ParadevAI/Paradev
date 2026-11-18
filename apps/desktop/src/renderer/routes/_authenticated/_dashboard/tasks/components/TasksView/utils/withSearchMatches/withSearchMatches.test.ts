import { describe, expect, test } from "bun:test";
import { withSearchMatches } from "./withSearchMatches";

const item = (id: string) => ({ task: { id } });

describe("withSearchMatches", () => {
	test("adds a match from outside the window once, after the window", () => {
		expect(
			withSearchMatches(
				[item("new-1"), item("new-2")],
				[item("new-2"), item("old")],
			).map(({ task }) => task.id),
		).toEqual(["new-1", "new-2", "old"]);
	});
});
