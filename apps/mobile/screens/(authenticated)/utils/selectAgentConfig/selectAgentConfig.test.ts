import { describe, expect, test } from "bun:test";
import { selectAgentConfig } from "./selectAgentConfig";

const claudeA = { id: "row-a", presetId: "claude" };
const claudeB = { id: "row-b", presetId: "claude" };
const codex = { id: "row-codex", presetId: "codex" };
const configs = [claudeA, claudeB, codex];

describe("selectAgentConfig", () => {
	test("launches the second of two rows that share a preset when it was picked", () => {
		expect(selectAgentConfig(configs, "claude", "row-b")).toBe(claudeB);
	});

	test("falls back to the first row of the preset when the picked row is not on this host", () => {
		expect(selectAgentConfig(configs, "claude", "row-on-other-host")).toBe(
			claudeA,
		);
	});

	test("falls back to the first row of the preset when nothing was picked on this host", () => {
		expect(selectAgentConfig(configs, "claude", undefined)).toBe(claudeA);
	});

	test("a later pick of another preset wins over the row remembered for this host", () => {
		expect(selectAgentConfig(configs, "codex", "row-b")).toBe(codex);
	});

	test("finds nothing when the host has no row for the preset", () => {
		expect(selectAgentConfig(configs, "gemini", undefined)).toBeUndefined();
	});
});
