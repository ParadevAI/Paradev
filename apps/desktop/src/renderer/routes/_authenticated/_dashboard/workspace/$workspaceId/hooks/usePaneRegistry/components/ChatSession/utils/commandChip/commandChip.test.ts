import { describe, expect, test } from "bun:test";
import { commandChip, commandLabel } from "./commandChip";

describe("commandChip", () => {
	test("labels a command by its readable name and sends it as typed", () => {
		expect(commandLabel("superpowers:using-superpowers")).toBe(
			"Using superpowers",
		);
		expect(commandLabel("goal")).toBe("Goal");
		expect(commandChip("mcp:search").serialized).toBe("/mcp:search");
	});

	test("a Codex skill keeps its own $ sigil instead of a slash", () => {
		expect(commandChip("$find-skills")).toMatchObject({
			label: "Find skills",
			serialized: "$find-skills",
		});
	});
});
