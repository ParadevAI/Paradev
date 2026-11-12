import { describe, expect, test } from "bun:test";
import type { AgentLifecyclePayload } from "@superset/workspace-client";
import { isChatTerminal, lifecycleChimes } from "./lifecycleChime";

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
		for (const isChat of [true, false]) {
			expect(lifecycleChimes(event("Stop", "s-1"), isChat)).toBe(true);
			expect(lifecycleChimes(event("PermissionRequest", "s-1"), isChat)).toBe(
				true,
			);
			expect(lifecycleChimes(event("Failed", "s-1"), isChat)).toBe(true);
		}
	});

	test("stays silent only for a chat whose agent never started", () => {
		expect(lifecycleChimes(event("Failed"), true)).toBe(false);
		expect(lifecycleChimes(event("Failed"), false)).toBe(true);
	});
});

describe("isChatTerminal", () => {
	test("finds the chat pane that owns the terminal", () => {
		const layout = {
			tabs: [
				{
					id: "tab-1",
					panes: {
						a: { id: "a", kind: "terminal", data: { terminalId: "t-term" } },
						b: { id: "b", kind: "chat-v3", data: { terminalId: "t-chat" } },
					},
				},
			],
		} as unknown as Parameters<typeof isChatTerminal>[1][number];
		expect(isChatTerminal("t-chat", [layout, null])).toBe(true);
		expect(isChatTerminal("t-term", [layout, null])).toBe(false);
	});
});
