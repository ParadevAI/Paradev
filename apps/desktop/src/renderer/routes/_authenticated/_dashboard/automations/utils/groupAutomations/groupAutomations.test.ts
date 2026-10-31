import { describe, expect, it } from "bun:test";
import { groupAutomations, listAutomationGroups } from "./groupAutomations";

const automation = (id: string, group: string | null) => ({ id, group });

describe("groupAutomations", () => {
	it("sorts named groups, puts ungrouped last, and keeps order inside a group", () => {
		const sections = groupAutomations([
			automation("a", null),
			automation("b", "ops"),
			automation("c", "Marketing"),
			automation("d", "ops"),
		]);
		expect(
			sections.map((s) => [s.group, s.items.map((item) => item.id)]),
		).toEqual([
			["Marketing", ["c"]],
			["ops", ["b", "d"]],
			[null, ["a"]],
		]);
	});

	it("returns one ungrouped section when nothing is grouped", () => {
		expect(groupAutomations([automation("a", null)])).toEqual([
			{ group: null, items: [automation("a", null)] },
		]);
	});
});

describe("listAutomationGroups", () => {
	it("lists each group once, sorted", () => {
		expect(
			listAutomationGroups([
				automation("a", "ops"),
				automation("b", null),
				automation("c", "Marketing"),
				automation("d", "ops"),
			]),
		).toEqual(["Marketing", "ops"]);
	});
});
