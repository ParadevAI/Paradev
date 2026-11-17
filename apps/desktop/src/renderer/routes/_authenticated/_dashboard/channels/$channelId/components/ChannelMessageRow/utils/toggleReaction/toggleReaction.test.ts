import { expect, test } from "bun:test";
import { toggleReaction } from "./toggleReaction";

test("adds to an emoji, starts a new one, and drops an emoji nobody uses", () => {
	const start = [{ emoji: "eyes", actorIds: ["a"] }];
	expect(toggleReaction(start, "eyes", "b", true)).toEqual([
		{ emoji: "eyes", actorIds: ["a", "b"] },
	]);
	expect(toggleReaction(start, "tada", "b", true)).toEqual([
		{ emoji: "eyes", actorIds: ["a"] },
		{ emoji: "tada", actorIds: ["b"] },
	]);
	expect(toggleReaction(start, "eyes", "a", true)).toEqual(start);
	expect(toggleReaction(start, "eyes", "a", false)).toEqual([]);
});
