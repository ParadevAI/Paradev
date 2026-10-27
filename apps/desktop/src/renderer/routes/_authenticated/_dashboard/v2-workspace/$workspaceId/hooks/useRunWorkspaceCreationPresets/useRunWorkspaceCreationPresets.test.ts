import { describe, expect, it } from "bun:test";
import type { V2TerminalPresetRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import {
	planCreationPresetRuns,
	resolvePendingCreationPresets,
} from "./useRunWorkspaceCreationPresets";

function preset(
	id: string,
	commands: string[],
	executionMode: V2TerminalPresetRow["executionMode"] = "new-tab",
): V2TerminalPresetRow {
	return {
		id,
		name: id,
		cwd: "",
		commands,
		projectIds: null,
		executionMode,
		tabOrder: 0,
		createdAt: new Date(0),
	};
}

describe("resolvePendingCreationPresets", () => {
	it("keeps queue order and drops deleted or empty presets", () => {
		const byId = new Map([
			["a", preset("a", ["bun dev"])],
			["empty", preset("empty", [])],
			["b", preset("b", ["bun test"])],
		]);

		const resolved = resolvePendingCreationPresets(
			["b", "deleted", "empty", "a"],
			(id) => byId.get(id),
			(p) => p.commands,
		);

		expect(resolved.map((p) => p.id)).toEqual(["b", "a"]);
	});
});

describe("planCreationPresetRuns", () => {
	it("splits split-pane presets into the agent tab before new tabs open", () => {
		const runs = planCreationPresetRuns([
			preset("tab", ["bun dev"], "new-tab"),
			preset("seq", ["bun i", "bun dev"], "sequential"),
			preset("split", ["bun test --watch"], "split-pane"),
		]);

		expect(runs.map(({ preset, options }) => [preset.id, options])).toEqual([
			["split", undefined],
			["tab", { target: "new-tab" }],
			["seq", { target: "new-tab" }],
		]);
	});
});
