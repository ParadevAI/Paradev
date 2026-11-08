import { describe, expect, it } from "bun:test";
import type { AgentChoice } from "../../types";
import { canSwitchAgent } from "./canSwitchAgent";

const claude: AgentChoice = { presetId: "claude", label: "Claude", models: [] };
const switcher = (agents: AgentChoice[]) => ({
	currentPresetId: "claude",
	agents,
	onSwitch: () => {},
});

describe("canSwitchAgent", () => {
	it("needs another agent or another account of the current one", () => {
		expect(canSwitchAgent(undefined)).toBe(false);
		expect(canSwitchAgent(switcher([claude]))).toBe(false);
		expect(
			canSwitchAgent(
				switcher([claude, { presetId: "codex", label: "Codex", models: [] }]),
			),
		).toBe(true);
		expect(
			canSwitchAgent(
				switcher([
					{
						...claude,
						accounts: [
							{ configId: "work", label: "Work", iconId: "claude" },
							{ configId: "personal", label: "Personal", iconId: "claude" },
						],
					},
				]),
			),
		).toBe(true);
	});
});
