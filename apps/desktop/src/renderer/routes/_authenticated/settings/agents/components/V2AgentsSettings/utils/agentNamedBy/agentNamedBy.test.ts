import { describe, expect, it } from "bun:test";
import { agentNamedBy } from "./agentNamedBy";

const agents = [
	{ id: "2", presetId: "mastracode", label: "Mastracode" },
	{ id: "3", presetId: "codex", label: "Codex" },
	{ id: "1", presetId: "claude", label: "Claude Code" },
];

describe("agentNamedBy", () => {
	it("picks the agent the search names, not the first in the list", () => {
		expect(agentNamedBy(agents, "codex")?.id).toBe("3");
		expect(agentNamedBy(agents, "Install Codex")?.id).toBe("3");
		expect(agentNamedBy(agents, "claude code")?.id).toBe("1");
	});

	it("names no agent for a search about something else", () => {
		expect(agentNamedBy(agents, "install")).toBeNull();
		expect(agentNamedBy(agents, "")).toBeNull();
	});
});
