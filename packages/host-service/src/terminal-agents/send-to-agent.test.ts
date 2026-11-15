import { describe, expect, it, mock } from "bun:test";
import type { ChatRuntime } from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { sendToAgent } from "./send-to-agent";
import type { TerminalAgentBinding } from "./types";

const chatBinding = {
	terminalId: "term-chat",
	workspaceId: "ws-1",
	agentId: "claude",
	chatSessionId: "chat-1",
	startedAt: 1,
} as TerminalAgentBinding;

function setup(status = "idle") {
	const prompt = mock((_input: unknown) => ({ itemId: "i", queued: false }));
	const chat = {
		commands: { prompt },
		live: { get: () => ({ state: { status } }) },
	} as unknown as ChatRuntime;
	const send = (overrides: Partial<Parameters<typeof sendToAgent>[0]> = {}) =>
		sendToAgent({
			terminalId: "term-chat",
			workspaceId: "ws-1",
			text: "In shipping.ts:L1: lower the threshold",
			submit: true,
			db: {} as HostDb,
			terminalAgentStore: {
				get: () => undefined,
				getChat: (terminalId) =>
					terminalId === "term-chat" ? chatBinding : undefined,
			},
			chatRuntime: () => chat,
			...overrides,
		});
	return { prompt, send };
}

describe("sendToAgent", () => {
	it("prompts the chat when the terminal id belongs to a chat", async () => {
		const { prompt, send } = setup();
		expect(await send()).toEqual({ success: true });
		expect(prompt.mock.calls[0]?.[0]).toMatchObject({
			sessionId: "chat-1",
			content: [
				{ type: "text", text: "In shipping.ts:L1: lower the threshold" },
			],
		});
	});

	it("refuses to leave unsent text in a chat", async () => {
		const { prompt, send } = setup();
		expect(await send({ submit: false })).toMatchObject({
			kind: "CHAT_NEEDS_SUBMITTED_TEXT",
		});
		expect(prompt).not.toHaveBeenCalled();
	});

	it("refuses a chat from another workspace", async () => {
		const { prompt, send } = setup();
		expect(await send({ workspaceId: "ws-2" })).toMatchObject({
			kind: "SESSION_WRONG_WORKSPACE",
		});
		expect(prompt).not.toHaveBeenCalled();
	});

	it("reports a chat whose agent stopped", async () => {
		const { prompt, send } = setup("dead");
		expect(await send()).toMatchObject({ kind: "SESSION_NOT_ACTIVE" });
		expect(prompt).not.toHaveBeenCalled();
	});

	it("uses the terminal path for a terminal agent", async () => {
		const { prompt, send } = setup();
		expect(await send({ terminalId: "term-shell" })).toMatchObject({
			kind: "SESSION_NOT_ACTIVE",
			error: "No agent is running in this terminal",
		});
		expect(prompt).not.toHaveBeenCalled();
	});
});
