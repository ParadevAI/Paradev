import { describe, expect, test } from "bun:test";
import { emojis } from "@tiptap/extension-emoji";
import { pickerSections, WORK } from "./pickerSections";

describe("pickerSections", () => {
	const sections = pickerSections(emojis, ["joy", "heart"]);

	test("follow Slack's order", () => {
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
		]);
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
