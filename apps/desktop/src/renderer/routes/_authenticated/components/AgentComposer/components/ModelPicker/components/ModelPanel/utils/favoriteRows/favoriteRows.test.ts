import { expect, test } from "bun:test";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { favoriteRows } from "./favoriteRows";

const agents = [
	{ presetId: "opencode", label: "OpenCode", models: [] },
	{ presetId: "claude", label: "Claude", models: [] },
];
const favorites = [
	{ presetId: "opencode", id: "anthropic/claude-opus-5-5", label: "Opus" },
	{ presetId: "opencode", id: "amazon-bedrock/x", label: "X" },
	{ presetId: "claude", id: "opus", label: "Opus" },
];
const hostModels: SessionConfigOption = {
	id: "model",
	label: "Model",
	options: [{ id: "amazon-bedrock/x", label: "X" }],
};

test("hides a favorite of the current agent that its session does not offer", () => {
	const rows = favoriteRows({
		favorites,
		agents,
		currentPresetId: "opencode",
		model: hostModels,
	});
	expect(rows.map((row) => `${row.presetId}:${row.id}`)).toEqual([
		"opencode:amazon-bedrock/x",
		"claude:opus",
	]);
});

test("keeps every favorite before the session reports its models", () => {
	const rows = favoriteRows({
		favorites,
		agents,
		currentPresetId: "opencode",
		model: undefined,
	});
	expect(rows).toHaveLength(3);
	expect(rows[0]?.agentLabel).toBe("OpenCode");
});

test("drops favorites of agents that are not on offer", () => {
	const rows = favoriteRows({
		favorites,
		agents: agents.slice(1),
		currentPresetId: "claude",
		model: undefined,
	});
	expect(rows.map((row) => row.id)).toEqual(["opus"]);
});
