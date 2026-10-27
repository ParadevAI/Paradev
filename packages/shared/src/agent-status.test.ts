import { describe, expect, it } from "bun:test";
import { agentRunState, withSubagentActivity } from "./agent-status";

describe("withSubagentActivity", () => {
	it("keeps the agent's own status when no subagent runs", () => {
		expect(withSubagentActivity("review", false)).toBe("review");
		expect(withSubagentActivity(null, false)).toBeNull();
	});

	it("reports working while a subagent runs", () => {
		expect(withSubagentActivity("review", true)).toBe("working");
		expect(withSubagentActivity(null, true)).toBe("working");
	});

	it("keeps permission and failed while a subagent runs", () => {
		expect(withSubagentActivity("permission", true)).toBe("permission");
		expect(withSubagentActivity("failed", true)).toBe("failed");
	});
});

describe("agentRunState", () => {
	it("reports working while a subagent runs, before or after the agent's own turn", () => {
		expect(agentRunState("Stop")).toBe("idle");
		expect(agentRunState("Stop", true)).toBe("working");
		expect(agentRunState("Attached")).toBe("starting");
		expect(agentRunState("Attached", true)).toBe("working");
	});

	it("stays blocked on a permission prompt while a subagent runs", () => {
		expect(agentRunState("PermissionRequest", true)).toBe("blocked");
	});
});
