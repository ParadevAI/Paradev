import { describe, expect, test } from "bun:test";
import { type EmojiItem, emojis } from "@tiptap/extension-emoji";
import {
	emojiForSlackName,
	slackEmojiChar,
	slackNames,
	slackReactionName,
	withSkinTone,
} from "./slackEmoji";

const byName = (name: string) =>
	emojis.find((e) => e.shortcodes.includes(name)) as EmojiItem;

describe("Slack's emoji names", () => {
	test("come from the code points, not the catalogue's first alias", () => {
		expect(slackNames(byName("pout"))[0]).toBe("rage");
		expect(slackNames(byName("+1"))).toEqual(["+1", "thumbsup"]);
		expect(slackNames(byName("one"))[0]).toBe("one");
	});

	test("find the emoji Slack names, even when the catalogue has no such alias", () => {
		expect(emojiForSlackName("large_blue_circle")?.emoji).toBe("🔵");
		expect(emojiForSlackName("heavy_plus_sign")?.emoji).toBe("➕");
	});

	test("a reaction name with a skin tone draws the toned character", () => {
		expect(slackEmojiChar("+1::skin-tone-3")).toBe("👍🏼");
		expect(slackEmojiChar("wave::skin-tone-6")).toBe("👋🏿");
		expect(slackEmojiChar("rage")).toBe("😡");
		expect(slackEmojiChar("partyparrot")).toBeUndefined();
	});

	test("a skin tone goes on the character and into the reaction name", () => {
		expect(withSkinTone("👍", 3)).toBe("👍🏽");
		expect(withSkinTone("👍", 0)).toBe("👍");
		expect(slackReactionName(byName("+1"), 2)).toBe("+1::skin-tone-3");
		expect(slackReactionName(byName("tada"), 2)).toBe("tada");
	});
});
