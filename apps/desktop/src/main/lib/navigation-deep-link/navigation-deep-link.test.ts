import { describe, expect, it } from "bun:test";
import { navigationDeepLinkPath } from "./navigation-deep-link";

describe("navigationDeepLinkPath", () => {
	it("ignores malformed links without throwing in the main process", () => {
		expect(navigationDeepLinkPath("superset://[invalid")).toBeNull();
	});

	it("preserves exact chat session search from CLI workspace links", () => {
		expect(
			navigationDeepLinkPath(
				"superset://v2-workspace/workspace-1?sessionId=session-1",
			),
		).toBe("/v2-workspace/workspace-1?sessionId=session-1");
	});

	it("preserves terminal links and repeated focus requests", () => {
		expect(
			navigationDeepLinkPath(
				"superset-dev://v2-workspace/workspace-1?terminalId=terminal-1&focusRequestId=request-1",
			),
		).toBe(
			"/v2-workspace/workspace-1?terminalId=terminal-1&focusRequestId=request-1",
		);
	});

	it("keeps navigation without search intact", () => {
		expect(navigationDeepLinkPath("superset://automations/automation-1")).toBe(
			"/automations/automation-1",
		);
	});
});
