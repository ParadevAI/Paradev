import { describe, expect, it } from "bun:test";
import {
	AUTOMATION_GROUP_MAX_LENGTH,
	automationGroupInputSchema,
	matchExistingAutomationGroup,
} from "./automation-group";

describe("automationGroupInputSchema", () => {
	it("trims and collapses whitespace, keeping case", () => {
		expect(automationGroupInputSchema.parse("  Daily   Ops ")).toBe(
			"Daily Ops",
		);
	});

	it("reads blank and null as ungrouped", () => {
		expect(automationGroupInputSchema.parse("   ")).toBeNull();
		expect(automationGroupInputSchema.parse(null)).toBeNull();
	});

	it("rejects a name over the limit", () => {
		const long = "x".repeat(AUTOMATION_GROUP_MAX_LENGTH + 1);
		expect(automationGroupInputSchema.safeParse(long).success).toBe(false);
	});
});

describe("matchExistingAutomationGroup", () => {
	it("reuses the existing spelling of a group", () => {
		expect(matchExistingAutomationGroup("marketing", ["Marketing"])).toBe(
			"Marketing",
		);
		expect(matchExistingAutomationGroup("Support", ["Marketing"])).toBe(
			"Support",
		);
	});
});
