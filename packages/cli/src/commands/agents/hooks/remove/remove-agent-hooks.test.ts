import { describe, expect, mock, test } from "bun:test";
import { AGENT_SETUP_TARGETS } from "@superset/agent-setup";
import { removeAgentHooks, resolveAgentIds } from "./remove-agent-hooks";

describe("resolveAgentIds", () => {
	test("--all selects every supported agent", () => {
		expect(resolveAgentIds({ all: true })).toEqual(
			AGENT_SETUP_TARGETS.map((target) => target.id),
		);
	});

	test("--agent selects only the named agents, once each", () => {
		expect(resolveAgentIds({ agent: ["devin", "claude", "devin"] })).toEqual([
			"devin",
			"claude",
		]);
	});

	test("rejects an unknown agent and a call with no selection", () => {
		expect(() => resolveAgentIds({ agent: ["nope"] })).toThrow(
			"Unknown agent: nope",
		);
		expect(() => resolveAgentIds({})).toThrow("Pass --all");
	});
});

describe("removeAgentHooks", () => {
	test("runs teardown for the selection with its logs on stderr", () => {
		const stdout = mock(() => {});
		const stderr = mock(() => {});
		const originalLog = console.log;
		const originalError = console.error;
		console.log = stdout;
		console.error = stderr;
		const teardown = mock((ids: readonly string[]) => {
			console.log("[agent-setup] removed");
			return ids.includes("codex") ? ["codex:removeCodexManagedHooks"] : [];
		});
		try {
			const result = removeAgentHooks({ agent: ["devin", "codex"] }, teardown);
			expect(teardown).toHaveBeenCalledWith(["devin", "codex"]);
			expect(result).toEqual({
				agents: ["devin", "codex"],
				failed: ["codex:removeCodexManagedHooks"],
			});
		} finally {
			console.log = originalLog;
			console.error = originalError;
		}
		expect(stdout).not.toHaveBeenCalled();
		expect(stderr).toHaveBeenCalledWith("[agent-setup] removed");
		expect(console.log).toBe(originalLog);
	});
});
