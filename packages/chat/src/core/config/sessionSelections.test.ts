import { expect, test } from "bun:test";
import { isSelectionCategory } from "./sessionSelections";

test("only the model, effort and mode categories are selections", () => {
	expect(isSelectionCategory("thought_level")).toBe(true);
	expect(isSelectionCategory("constructor")).toBe(false);
	expect(isSelectionCategory("collaboration_mode")).toBe(false);
	expect(isSelectionCategory(undefined)).toBe(false);
});
