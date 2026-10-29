import { describe, expect, test } from "bun:test";
import { emojis } from "@tiptap/extension-emoji";
import { rankEmoji } from "./rankEmoji";

const names = (q: string, n = 5) =>
	rankEmoji(emojis, q, n).map((e) => e.shortcodes[0]);

describe("rankEmoji", () => {
	test("a shortcode starting with the query beats a tag match", () => {
		const top = names("laugh");
		expect(top[0]).toBe("laughing");
		expect(top).not.toContain("grinning");
	});

	test("an exact shortcode comes first", () => {
		expect(names("joy")[0]).toBe("joy");
	});

	test("a word inside a shortcode ranks before a tag", () => {
		const top = names("floor", 3);
		expect(top[0]).toBe("rofl");
	});

	test("custom emoji rank by their name like any other", () => {
		const custom = [
			{
				name: "partyparrot",
				shortcodes: ["partyparrot"],
				tags: [],
				group: "custom",
			},
		];
		expect(rankEmoji([...custom, ...emojis], "partyp", 1)[0]?.name).toBe(
			"partyparrot",
		);
	});
});
