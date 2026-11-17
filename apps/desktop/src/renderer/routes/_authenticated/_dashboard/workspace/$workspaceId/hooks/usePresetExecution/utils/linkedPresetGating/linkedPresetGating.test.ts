import { describe, expect, it } from "bun:test";
import {
	isLinkedPresetLaunchable,
	isLinkedPresetVisible,
} from "./linkedPresetGating";

const flagOff = (presetId: string) => presetId !== "pdev";
const flagOn = () => true;
const agents = [
	{ id: "uuid-pdev", presetId: "pdev", command: "pdev", args: [] },
	{ id: "uuid-claude", presetId: "claude", command: "claude", args: [] },
];

describe("isLinkedPresetVisible", () => {
	it("keeps presets with no linked agent", () => {
		expect(isLinkedPresetVisible(undefined, undefined, flagOff)).toBe(true);
	});

	it("hides a preset linked to a gated agent by UUID or preset id", () => {
		expect(isLinkedPresetVisible("uuid-pdev", agents, flagOff)).toBe(false);
		expect(isLinkedPresetVisible("pdev", undefined, flagOff)).toBe(false);
		expect(isLinkedPresetVisible("uuid-pdev", agents, flagOn)).toBe(true);
	});

	it("keeps presets linked to ungated agents", () => {
		expect(isLinkedPresetVisible("uuid-claude", agents, flagOff)).toBe(true);
		expect(isLinkedPresetVisible("claude", undefined, flagOff)).toBe(true);
	});

	it("keeps a UUID link visible while the agent list is unresolved", () => {
		expect(isLinkedPresetVisible("uuid-claude", undefined, flagOff)).toBe(true);
	});
});

describe("isLinkedPresetLaunchable", () => {
	const pdevPreset = { agentId: "uuid-pdev", commands: ["pdev --model x"] };
	const claudePreset = { agentId: "uuid-claude", commands: ["claude"] };

	it("blocks an unresolved link whose stored command runs a gated agent", () => {
		expect(isLinkedPresetLaunchable(pdevPreset, undefined, flagOff)).toBe(
			false,
		);
		expect(isLinkedPresetLaunchable(pdevPreset, undefined, flagOn)).toBe(true);
	});

	it("launches an unresolved link to an ungated agent", () => {
		expect(isLinkedPresetLaunchable(claudePreset, undefined, flagOff)).toBe(
			true,
		);
	});

	it("follows the resolved agent once the list loads", () => {
		expect(isLinkedPresetLaunchable(claudePreset, agents, flagOff)).toBe(true);
		expect(
			isLinkedPresetLaunchable(
				{ agentId: "uuid-pdev", commands: ["claude"] },
				agents,
				flagOff,
			),
		).toBe(false);
		expect(
			isLinkedPresetLaunchable(
				{ agentId: "pdev", commands: [] },
				undefined,
				flagOff,
			),
		).toBe(false);
	});

	it("checks the stored command of a link whose agent was deleted", () => {
		expect(
			isLinkedPresetLaunchable(
				{ agentId: "uuid-gone", commands: ["pdev"] },
				agents,
				flagOff,
			),
		).toBe(false);
		expect(
			isLinkedPresetLaunchable(
				{ agentId: "uuid-gone", commands: ["claude"] },
				agents,
				flagOff,
			),
		).toBe(true);
	});
});
