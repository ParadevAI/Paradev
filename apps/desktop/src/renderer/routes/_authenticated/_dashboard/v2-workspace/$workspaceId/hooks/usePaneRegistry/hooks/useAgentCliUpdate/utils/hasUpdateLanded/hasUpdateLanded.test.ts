import { describe, expect, it } from "bun:test";
import type { AgentCliStatus } from "@superset/shared/agent-cli-status";
import { hasUpdateLanded } from "./hasUpdateLanded";

const WATCH = {
	from: "0.161.0",
	source: "npm",
	sessionId: "session-1",
	until: 0,
} as const;

function status(installed: string | null, source: AgentCliStatus["source"]) {
	return {
		binary: "codex",
		installed,
		minVersion: "0.160.0",
		belowFloor: false,
		latest: "0.165.0",
		behind: false,
		source,
		updateCommand: null,
	} satisfies AgentCliStatus;
}

describe("hasUpdateLanded", () => {
	it("waits out an install caught half way", () => {
		expect(hasUpdateLanded(WATCH, status("0.162.0", "bun"))).toBe(false);
		expect(hasUpdateLanded(WATCH, status(null, "unknown"))).toBe(false);
		expect(hasUpdateLanded(WATCH, status("0.165.0", "npm"))).toBe(true);
	});
});
