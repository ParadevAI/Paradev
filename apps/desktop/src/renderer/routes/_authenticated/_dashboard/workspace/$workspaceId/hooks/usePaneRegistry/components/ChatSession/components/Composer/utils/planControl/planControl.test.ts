import { describe, expect, test } from "bun:test";
import { planControl } from "./planControl";

const CLAUDE_MODES = [
	{ id: "default" },
	{ id: "acceptEdits" },
	{ id: "plan" },
	{ id: "bypassPermissions" },
];

describe("planControl", () => {
	test("switches a plan mode and leaves it for the mode it came from", () => {
		expect(
			planControl({
				configOptions: [],
				modes: CLAUDE_MODES,
				currentModeId: "plan",
				modeBeforePlan: "bypassPermissions",
			}),
		).toEqual({
			active: true,
			enter: { modeId: "plan" },
			leave: { modeId: "bypassPermissions" },
		});
		expect(
			planControl({
				configOptions: [],
				modes: CLAUDE_MODES,
				currentModeId: "plan",
				modeBeforePlan: undefined,
			})?.leave,
		).toEqual({ modeId: "default" });
	});

	test("switches a plan config option when the agent has no plan mode", () => {
		expect(
			planControl({
				configOptions: [
					{
						id: "collaboration_mode",
						label: "Collaboration mode",
						category: "collaboration_mode",
						currentValue: "default",
						options: [
							{ id: "default", label: "Default" },
							{ id: "plan", label: "Plan" },
						],
					},
				],
				modes: [{ id: "read-only" }, { id: "full-access" }],
				currentModeId: "full-access",
				modeBeforePlan: undefined,
			}),
		).toEqual({
			active: false,
			enter: { configId: "collaboration_mode", value: "plan" },
			leave: { configId: "collaboration_mode", value: "default" },
		});
	});

	test("offers nothing to an agent without plan", () => {
		expect(
			planControl({
				configOptions: [],
				modes: [{ id: "read-only" }, { id: "full-access" }],
				currentModeId: "full-access",
				modeBeforePlan: undefined,
			}),
		).toBeNull();
	});
});
