import { describe, expect, test } from "bun:test";
import { airPermissionReason } from "./air";

const withDescription = (description: string | null) => ({
	_meta: { jetbrains: { air: { permission: { description } } } },
});

describe("airPermissionReason", () => {
	test("strips claude-agent-acp's prefix and keeps codex-acp's bare reason", () => {
		expect(airPermissionReason(withDescription("Reason: Deletes files"))).toBe(
			"Deletes files",
		);
		expect(
			airPermissionReason(withDescription("Writes outside the workspace")),
		).toBe("Writes outside the workspace");
	});

	test("is undefined without an AIR permission or with an empty description", () => {
		expect(airPermissionReason({ toolCall: { title: "ls" } })).toBeUndefined();
		expect(airPermissionReason(withDescription(null))).toBeUndefined();
		expect(airPermissionReason(withDescription("Reason:  "))).toBeUndefined();
	});
});
