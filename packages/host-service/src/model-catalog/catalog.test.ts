import { expect, test } from "bun:test";
import { parseCursorModels, withoutDefaultAlias } from "./catalog";

test("Cursor model listings preserve effort-specific IDs", () => {
	expect(
		parseCursorModels(
			"Available models\nmodel-high - Model High (default)\nauto - Auto (current, default)\n",
		),
	).toEqual([
		{ id: "model-high", label: "Model High" },
		{ id: "auto", label: "Auto" },
	]);
});

test("a runtime's own default alias is not listed as a model", () => {
	expect(
		withoutDefaultAlias([
			{ id: "default", label: "Default (recommended)" },
			{ id: "opus", label: "Opus" },
		]),
	).toEqual([{ id: "opus", label: "Opus" }]);
});
