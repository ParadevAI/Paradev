import { describe, expect, it } from "bun:test";
import type { AgentCliStatus } from "@superset/shared/agent-cli-status";
import { hasUpdateLanded } from "./hasUpdateLanded";

const UPDATE = "npm install -g --prefix /opt/a @openai/codex@latest";
const OTHER_NPM = "npm install -g --prefix /opt/b @openai/codex@latest";

const WATCH = {
	from: "0.161.0",
	command: UPDATE,
	sessionId: "session-1",
	until: 0,
};

function status(
	installed: string | null,
	source: AgentCliStatus["source"],
	updateCommand: string | null,
) {
	return {
		binary: "codex",
		installed,
		minVersion: "0.160.0",
		belowFloor: false,
		latest: "0.165.0",
		behind: false,
		source,
		updateCommand,
	} satisfies AgentCliStatus;
}

describe("hasUpdateLanded", () => {
	it("waits out an install caught half way, even past another npm install", () => {
		const bun = "/home/u/.bun/bin/bun add -g @openai/codex@latest";
		expect(hasUpdateLanded(WATCH, status("0.162.0", "bun", bun))).toBe(false);
		expect(hasUpdateLanded(WATCH, status(null, "unknown", null))).toBe(false);
		expect(hasUpdateLanded(WATCH, status("0.161.0", "npm", UPDATE))).toBe(
			false,
		);
		expect(hasUpdateLanded(WATCH, status("0.150.0", "npm", OTHER_NPM))).toBe(
			false,
		);
		expect(hasUpdateLanded(WATCH, status("0.165.0", "npm", UPDATE))).toBe(true);
	});
});
