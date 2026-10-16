import { describe, expect, test } from "bun:test";
import {
	orderedSelection,
	sameSelection,
	togglePick,
	triageSentence,
} from "./triageSelection";

describe("orderedSelection", () => {
	test("the issue's own names lead in the issue's order, then the added ones as picked", () => {
		expect(
			orderedSelection(["bug", "sync"], ["p1", "sync", "bug", "ios"]),
		).toEqual(["bug", "sync", "p1", "ios"]);
	});

	test("a name taken off is left out", () => {
		expect(orderedSelection(["bug", "sync"], ["sync"])).toEqual(["sync"]);
	});
});

describe("togglePick", () => {
	test("adds at the end and takes off", () => {
		expect(togglePick(["a"], "b")).toEqual(["a", "b"]);
		expect(togglePick(["a", "b"], "a")).toEqual(["b"]);
	});

	test("a pick past the limit changes nothing, and taking off still works", () => {
		expect(togglePick(["a", "b"], "c", 2)).toEqual(["a", "b"]);
		expect(togglePick(["a", "b"], "a", 2)).toEqual(["b"]);
	});
});

test("sameSelection ignores order", () => {
	expect(sameSelection(["a", "b"], ["b", "a"])).toBe(true);
	expect(sameSelection(["a"], ["a", "b"])).toBe(false);
});

describe("triageSentence", () => {
	const plan = {
		lead: "On lumen-labs/app#511: ",
		addLabels: "add labels {names}",
		removeLabels: "remove labels {names}",
		assign: "assign {names}",
		unassign: "unassign {names}",
	};
	const current = { labels: ["bug", "sync"], assignees: ["avery-chen"] };

	test("names only what changes, in the server's order", () => {
		expect(
			triageSentence(plan, current, {
				labels: ["sync", "p1", "ios"],
				assignees: ["blake-rivera"],
			}),
		).toBe(
			"On lumen-labs/app#511: add labels p1, ios; remove labels bug; assign blake-rivera; unassign avery-chen?",
		);
	});

	test("one clause alone", () => {
		expect(
			triageSentence(plan, current, { labels: ["bug", "sync"], assignees: [] }),
		).toBe("On lumen-labs/app#511: unassign avery-chen?");
	});

	test("none when nothing changes", () => {
		expect(triageSentence(plan, current, current)).toBeUndefined();
	});

	test("a name with a mark in it is left as written", () => {
		expect(
			triageSentence(plan, current, {
				labels: ["bug", "sync", "{names}$&"],
				assignees: ["avery-chen"],
			}),
		).toBe("On lumen-labs/app#511: add labels {names}$&?");
	});
});
