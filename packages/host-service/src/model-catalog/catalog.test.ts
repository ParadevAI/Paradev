import { expect, test } from "bun:test";
import { parseCursorModels } from "./catalog";

test("Cursor model listings preserve effort-specific IDs", () => {
	expect(
		parseCursorModels(
			"Available models\nmodel-high - Model High\nauto - Auto (current)\n",
		),
	).toEqual([
		{ id: "model-high", label: "Model High" },
		{ id: "auto", label: "Auto" },
	]);
});
