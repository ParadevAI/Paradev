import { describe, expect, test } from "bun:test";
import { chosenFirst, inOrder, labelColor } from "./label-color.ts";

test("a label keeps its colour, whatever its case or padding", () => {
	expect(labelColor("Gmail")).toBe(labelColor(" gmail "));
	expect(labelColor("Gmail")).toMatch(/^#[0-9a-f]{6}$/);
});

const known = [
	{ name: "Gmail", count: 4 },
	{ name: "Client", count: 3 },
	{ name: "Writing", count: 1 },
];

describe("chosenFirst", () => {
	test("puts the task's labels first, in any case, keeping the rest's order", () => {
		expect(chosenFirst(known, ["writing"]).map((l) => l.name)).toEqual([
			"Writing",
			"Gmail",
			"Client",
		]);
	});

	test("leaves the order alone when nothing is chosen", () => {
		expect(chosenFirst(known, []).map((l) => l.name)).toEqual([
			"Gmail",
			"Client",
			"Writing",
		]);
	});
});

describe("inOrder", () => {
	test("keeps the order from opening when counts change, and puts a new label after", () => {
		const later = [
			{ name: "Client", count: 5 },
			{ name: "Urgent", count: 1 },
			{ name: "gmail", count: 4 },
			{ name: "Writing", count: 1 },
		];
		expect(
			inOrder(later, ["Writing", "Gmail", "Client"]).map((l) => l.name),
		).toEqual(["Writing", "gmail", "Client", "Urgent"]);
	});
});
