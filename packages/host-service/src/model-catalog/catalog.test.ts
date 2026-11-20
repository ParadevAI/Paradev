import { expect, test } from "bun:test";
import { parseListedModels } from "./catalog";

test("OpenCode model listings keep custom provider IDs and exclude status output", () => {
	expect(
		parseListedModels(
			"Updating registry\nprivate/custom-model\nprivate/custom-model\nopenai/model\n",
			"opencode",
		),
	).toEqual([
		{ id: "private/custom-model", label: "private/custom-model" },
		{ id: "openai/model", label: "openai/model" },
	]);
});
test("Cursor model listings preserve effort-specific IDs", () => {
	expect(
		parseListedModels(
			"Available models\nmodel-high - Model High\nauto - Auto (current)\n",
			"cursor-agent",
		),
	).toEqual([
		{ id: "model-high", label: "Model High" },
		{ id: "auto", label: "Auto" },
	]);
});
