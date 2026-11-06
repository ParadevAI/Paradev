import { expect, test } from "bun:test";
import { sessionInfoFromState } from "./sessionInfoFromState";

test("reports the session's model, effort and mode so the pane can resume on them", () => {
	const option = (category: string, currentValue: string) => ({
		id: category,
		label: category,
		category,
		currentValue,
		options: [{ id: currentValue, label: currentValue }],
	});
	expect(
		sessionInfoFromState(
			{
				status: "idle",
				harness: "claude-acp",
				modeId: "bypassPermissions",
				configOptions: [
					option("model", "claude-opus-5-5"),
					option("thought_level", "high"),
				],
			},
			undefined,
		),
	).toEqual({
		modelId: "claude-opus-5-5",
		effortId: "high",
		modeId: "bypassPermissions",
	});
});

test("reports a harness session only when it differs from the bound one", () => {
	const state = {
		status: "idle" as const,
		harness: "claude-acp",
		harnessSessionId: "native",
	};
	expect(sessionInfoFromState(state, "native")).toEqual({});
	expect(sessionInfoFromState(state, "other")).toEqual({
		harnessSessionId: "native",
	});
});
