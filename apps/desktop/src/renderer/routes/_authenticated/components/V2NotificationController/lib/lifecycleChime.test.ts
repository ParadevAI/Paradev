import { describe, expect, test } from "bun:test";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import { lifecycleChimes } from "./lifecycleChime";

function event(
	eventType: AgentLifecyclePayload["eventType"],
	sessionId?: string,
): AgentLifecyclePayload {
	return {
		eventType,
		terminalId: "t-1",
		agent: { agentId: "claude", ...(sessionId ? { sessionId } : {}) },
		occurredAt: 0,
	};
}

describe("lifecycleChimes", () => {
	test("chimes when a turn ends or the agent asks", () => {
		expect(lifecycleChimes(event("Stop", "s-1"))).toBe(true);
		expect(lifecycleChimes(event("PermissionRequest", "s-1"))).toBe(true);
		expect(lifecycleChimes(event("Failed", "s-1"))).toBe(true);
	});

	test("stays silent for an agent that never started", () => {
		expect(lifecycleChimes(event("Failed"))).toBe(false);
	});
});
