import { describe, expect, test } from "bun:test";
import { type EmojiItem, emojis } from "@tiptap/extension-emoji";
import { pickerSections, WORK } from "./pickerSections";

const custom: EmojiItem = {
	name: "shipit",
	shortcodes: ["shipit"],
	tags: [],
	group: "custom",
	fallbackImage: "https://example.com/shipit.png",
};

describe("pickerSections", () => {
	const sections = pickerSections([custom, ...emojis], ["joy", "heart"]);

	test("follow Slack's order and end with the workspace's own emoji", () => {
		expect(sections.map((s) => s.id)).toEqual([
			"frequent",
			"work",
			"people",
			"nature",
			"food",
			"travel",
			"activities",
			"objects",
			"symbols",
			"flags",
			"custom",
		]);
		expect(sections.at(-1)?.items).toEqual([custom]);
	});

	test("Getting Work Done holds all 26 of Slack's emoji", () => {
		expect(sections[1]?.items.map((i) => i.emoji)).toHaveLength(WORK.length);
	});

	test("Smileys & People starts with the smileys and leaves out the letter tiles", () => {
		const people = sections.find((s) => s.id === "people")?.items ?? [];
		expect(people[0]?.emoji).toBe("😀");
		expect(people.some((i) => i.name.startsWith("regional_indicator_"))).toBe(
			false,
		);
	});
});
