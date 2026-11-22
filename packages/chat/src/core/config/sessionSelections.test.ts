import { expect, test } from "bun:test";
import {
	isSelectionCategory,
	selectionCategoryOf,
	sessionSelections,
} from "./sessionSelections";

test("only the model, effort and mode categories are selections", () => {
	expect(isSelectionCategory("thought_level")).toBe(true);
	expect(isSelectionCategory("constructor")).toBe(false);
	expect(isSelectionCategory("collaboration_mode")).toBe(false);
	expect(isSelectionCategory(undefined)).toBe(false);
});

const fast = {
	id: "fast",
	label: "Fast mode",
	currentValue: "on",
	options: [
		{ id: "off", label: "Off" },
		{ id: "on", label: "On" },
	],
};

test("fast mode is a selection by its id, not its category", () => {
	expect(selectionCategoryOf(fast)).toBe("fast");
	expect(
		selectionCategoryOf({ ...fast, id: "fast-mode", category: "model_config" }),
	).toBe("fast");
	expect(selectionCategoryOf({ ...fast, id: "turbo" })).toBeUndefined();
	expect(
		selectionCategoryOf({ ...fast, id: "speed", category: "fast" }),
	).toBeUndefined();
	expect(sessionSelections({ status: "idle", configOptions: [fast] })).toEqual({
		fast: "on",
	});
});
