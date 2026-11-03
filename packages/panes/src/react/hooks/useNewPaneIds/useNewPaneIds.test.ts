import { describe, expect, test } from "bun:test";
import { newPaneIds } from "./useNewPaneIds";

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
