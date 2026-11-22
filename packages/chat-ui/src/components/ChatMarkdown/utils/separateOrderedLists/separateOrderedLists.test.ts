import { describe, expect, test } from "bun:test";
import { separateOrderedLists } from "./separateOrderedLists";

describe("separateOrderedLists", () => {
	test("starts a list that continues its numbering after a paragraph line", () => {
		expect(
			separateOrderedLists("**Follow-ups**\n4. First\n5. Second\n\nNext"),
		).toBe("**Follow-ups**\n\n4. First\n5. Second\n\nNext");
	});

	test("leaves markdown that already renders as a list alone", () => {
		for (const markdown of [
			"Intro\n1. First\n2. Second",
			"1. First\ncontinued\n2. Second",
			"- Item\n  text\n3. Third",
			"## Heading\n4. Fourth",
			"> **Quote**\n> 4. Fourth",
			"```\nlabel\n4. not a list\n```",
		]) {
			expect(separateOrderedLists(markdown)).toBe(markdown);
		}
	});
});
