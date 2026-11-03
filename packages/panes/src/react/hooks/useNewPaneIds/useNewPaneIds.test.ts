import { describe, expect, test } from "bun:test";
import { newPaneIds, newPaneIdsInTab } from "./useNewPaneIds";

describe("newPaneIds", () => {
	test("reports nothing on the first look", () => {
		expect([...newPaneIds(["a", "b"], null)]).toEqual([]);
	});

	test("reports only the panes that joined", () => {
		expect([...newPaneIds(["a", "b", "c"], new Set(["a", "b"]))]).toEqual([
			"c",
		]);
		expect([...newPaneIds(["a", "b"], new Set(["a", "b"]))]).toEqual([]);
	});

	test("a pane that left and returned counts as new again", () => {
		expect([...newPaneIds(["a", "b"], new Set(["a"]))]).toEqual(["b"]);
	});
});

describe("newPaneIdsInTab", () => {
	test("a switch to another tab is a first look, so nothing is new", () => {
		const seen = { tabId: "tab-a", ids: new Set(["p1"]) };
		expect([...newPaneIdsInTab("tab-b", ["p2", "p3"], seen)]).toEqual([]);
	});

	test("a pane added to the tab already on screen is new", () => {
		const seen = { tabId: "tab-b", ids: new Set(["p2", "p3"]) };
		expect([...newPaneIdsInTab("tab-b", ["p2", "p3", "p4"], seen)]).toEqual([
			"p4",
		]);
	});
});
