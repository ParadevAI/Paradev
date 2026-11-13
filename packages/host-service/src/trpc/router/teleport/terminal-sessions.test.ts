import { describe, expect, test } from "bun:test";
import type { TerminalAgentBinding } from "../../../terminal-agents";
import { movableTerminals, waitForAgentStart } from "./terminal-sessions";

function binding(
	terminalId: string,
	overrides: Partial<TerminalAgentBinding> = {},
): TerminalAgentBinding {
	return {
		terminalId,
		workspaceId: "workspace-1",
		agentId: "claude",
		agentSessionId: `session-${terminalId}`,
		startedAt: 1,
		lastEventAt: 1,
		lastEventType: "Stop",
		...overrides,
	};
}

describe("movableTerminals", () => {
	test("moves live terminal agents with a session a provider can carry", () => {
		const moved = movableTerminals(
			[
				binding("idle"),
				binding("working", {
					definitionId: "custom:reviewer",
					lastEventType: "Start",
				}),
				binding("chat", { chatSessionId: "chat-1" }),
				binding("ended", { endedAt: 2, endReason: "detached" }),
				binding("no-session", { agentSessionId: undefined }),
				binding("codex", { agentId: "codex" }),
			],
			(agent) => (agent === "claude" ? "Claude Code" : undefined),
		);

		expect(moved).toEqual([
			{
				terminalId: "idle",
				agent: "claude",
				agentId: "claude",
				harnessSessionId: "session-idle",
				title: "Claude Code",
				busy: false,
			},
			{
				terminalId: "working",
				agent: "custom:reviewer",
				agentId: "claude",
				harnessSessionId: "session-working",
				title: "claude",
				busy: true,
			},
		]);
	});
});

describe("waitForAgentStart", () => {
	const noWait = async () => {};

	test("is true once the agent reports after the launch", async () => {
		let polls = 0;
		const store = {
			get: () => ({ lastEventAt: polls++ < 2 ? 100 : 101 }) as never,
		};

		expect(
			await waitForAgentStart(store, "term-1", 100, {
				timeoutMs: 5_000,
				pollMs: 500,
				sleep: noWait,
			}),
		).toBe(true);
	});

	test("is false when the agent never reports", async () => {
		const store = { get: () => ({ lastEventAt: 100 }) as never };

		expect(
			await waitForAgentStart(store, "term-1", 100, {
				timeoutMs: 2_000,
				pollMs: 500,
				sleep: noWait,
			}),
		).toBe(false);
	});
});
