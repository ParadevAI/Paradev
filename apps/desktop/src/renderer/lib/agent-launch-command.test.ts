import { describe, expect, it } from "bun:test";
import {
	findLinkedAgent,
	getAgentCommandText,
	isTerminalPresetEnabled,
	parseAgentCommandText,
	resolvePresetLaunchCommands,
} from "./agent-launch-command";

describe("agent launch command helpers", () => {
	const agent = {
		id: "claude-config",
		presetId: "claude",
		command: "claude",
		args: ["--dangerously-skip-permissions"],
		env: {
			ANTHROPIC_BASE_URL: "https://example.test",
			ANTHROPIC_AUTH_TOKEN: "abc",
		},
	};

	it("builds command strings with structured env assignments", () => {
		expect(getAgentCommandText(agent)).toBe(
			"ANTHROPIC_BASE_URL=https://example.test ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions",
		);
	});

	it("preserves shell snippets instead of reparsing them as argv", () => {
		const command =
			"setCodexMode work && codex --dangerously-bypass-approvals-and-sandbox";
		expect(parseAgentCommandText(command)).toEqual({
			command,
			args: [],
			env: {},
		});
		expect(
			getAgentCommandText({
				command,
				args: [],
				env: {},
			}),
		).toBe(command);
	});

	it("does not treat quoted shell operators as shell snippets", () => {
		expect(parseAgentCommandText("claude --label 'a && b'")).toEqual({
			command: "claude",
			args: ["--label", "a && b"],
			env: {},
		});
	});

	it("resolves linked presets from the live agent config instead of the snapshot", () => {
		expect(
			resolvePresetLaunchCommands(
				{
					agentId: "claude-config",
					commands: ["claude --dangerously-skip-permissions"],
				},
				[agent],
			),
		).toEqual([
			"ANTHROPIC_BASE_URL=https://example.test ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions",
		]);
	});

	it("resolves agent settings targets by UUID or built-in preset id", () => {
		const secondAgent = {
			...agent,
			id: "codex-config-uuid",
			presetId: "codex",
			command: "codex",
		};
		const agents = [agent, secondAgent];

		expect(findLinkedAgent(agents, "codex-config-uuid")).toBe(secondAgent);
		expect(findLinkedAgent(agents, "codex")).toBe(secondAgent);
		expect(findLinkedAgent(agents, "missing")).toBeNull();
	});

	it("falls back to snapshot commands when the linked agent is unavailable", () => {
		expect(
			resolvePresetLaunchCommands(
				{
					agentId: "missing-agent",
					commands: ["claude --dangerously-skip-permissions"],
				},
				[agent],
			),
		).toEqual(["claude --dangerously-skip-permissions"]);
	});
});

describe("isTerminalPresetEnabled", () => {
	const pdevOff = (presetId: string) => presetId !== "pdev";

	it("hides a gated preset by its name or by the command it runs", () => {
		expect(
			isTerminalPresetEnabled({ name: "pdev", commands: [] }, pdevOff),
		).toBe(false);
		expect(
			isTerminalPresetEnabled(
				{ name: "my agent", commands: ["pdev --model pdev/auto"] },
				pdevOff,
			),
		).toBe(false);
	});

	it("finds a gated agent behind env, paths, quotes and shell operators", () => {
		for (const command of [
			"FOO=1 pdev",
			"cd repo && pdev",
			"/usr/local/bin/pdev --model x",
			'"pdev"',
			"echo hi; BAR=2 ~/.superset/bin/pdev",
		]) {
			expect(
				isTerminalPresetEnabled(
					{ name: "my agent", commands: [command] },
					pdevOff,
				),
			).toBe(false);
		}
		expect(
			isTerminalPresetEnabled(
				{ name: "my agent", commands: ["echo pdev", "claude --pdev"] },
				pdevOff,
			),
		).toBe(true);
	});

	it("keeps other presets, and gated ones once the flag is on", () => {
		expect(
			isTerminalPresetEnabled(
				{ name: "claude", commands: ["claude"] },
				pdevOff,
			),
		).toBe(true);
		expect(
			isTerminalPresetEnabled(
				{ name: "my agent", commands: ["pdev"] },
				() => true,
			),
		).toBe(true);
	});
});
