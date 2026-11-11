import { describe, expect, test } from "bun:test";
import type { AgentBinary } from "@superset/agent-setup/agent-binary";
import { cliFloor } from "@superset/host-service/acp-catalogue";
import { detectCodingAgent } from "./detect-coding-agent";

const CLAUDE_FLOOR = cliFloor("claude-acp").minVersion;

function deps(binary: AgentBinary | null, versionOutput: string) {
	const calls: string[][] = [];
	return {
		calls,
		userPath: async () => "/opt/homebrew/bin:/usr/bin",
		resolve: () => binary,
		run: async (command: string, args: string[]) => {
			calls.push([command, ...args]);
			return { code: 0, stdout: versionOutput };
		},
	};
}

describe("detectCodingAgent", () => {
	test("is usable only at the version host-service needs for chat", async () => {
		const found = { path: "/opt/homebrew/bin/claude", source: "path" } as const;
		expect(
			await detectCodingAgent("claude", deps(found, "2.1.322 (Claude Code)\n")),
		).toMatchObject({ installed: true, version: "2.1.322", usable: true });
		expect(
			await detectCodingAgent("claude", deps(found, "1.0.0 (Claude Code)\n")),
		).toMatchObject({
			installed: true,
			usable: false,
			minVersion: CLAUDE_FLOOR,
		});
	});

	test("runs nothing when the agent is missing", async () => {
		const d = deps(null, "");
		expect(await detectCodingAgent("codex", d)).toMatchObject({
			installed: false,
			usable: false,
		});
		expect(d.calls).toEqual([]);
	});
});
