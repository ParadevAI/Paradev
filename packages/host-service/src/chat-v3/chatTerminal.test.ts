import { describe, expect, it, mock } from "bun:test";
import type { ChatRuntime } from "@superset/chat-runtime";
import {
	chatTranscriptText,
	findChatTerminal,
	interruptChat,
	sendToChat,
} from "./chatTerminal";

function fakeRuntime(outline: {
	turns?: Array<{ id: string; status: string }>;
	items?: Array<Record<string, unknown>>;
}) {
	const prompt = mock((_input: unknown) => ({ itemId: "i", queued: false }));
	const cancelTurn = mock((_input: unknown) => {});
	const runtime = {
		commands: {
			prompt,
			cancelTurn,
			getOutline: () => ({
				ok: true,
				outline: {
					session: null,
					cursor: null,
					turns: outline.turns ?? [],
					items: (outline.items ?? []).map((item) => ({
						turnId: "turn-1",
						item: { startedAtMs: 0, ...item },
					})),
				},
			}),
		},
	} as unknown as ChatRuntime;
	return { runtime, prompt, cancelTurn };
}

describe("findChatTerminal", () => {
	const { runtime } = fakeRuntime({});
	const store = {
		getChat: (terminalId: string) =>
			terminalId === "term-chat"
				? ({
						terminalId,
						workspaceId: "ws-1",
						chatSessionId: "chat-1",
					} as never)
				: undefined,
	};

	it("resolves a chat bound to the terminal in the same workspace", () => {
		expect(
			findChatTerminal(
				{ runtime: { chat: () => runtime }, terminalAgentStore: store },
				{ workspaceId: "ws-1", terminalId: "term-chat" },
			),
		).toEqual({ runtime, chatSessionId: "chat-1" });
	});

	it("ignores a chat in another workspace and a plain terminal", () => {
		const ctx = { runtime: { chat: () => runtime }, terminalAgentStore: store };
		expect(
			findChatTerminal(ctx, { workspaceId: "ws-2", terminalId: "term-chat" }),
		).toBeNull();
		expect(
			findChatTerminal(ctx, { workspaceId: "ws-1", terminalId: "term-pty" }),
		).toBeNull();
	});
});

describe("sendToChat", () => {
	it("prompts the chat session with the text", () => {
		const { runtime, prompt } = fakeRuntime({});
		sendToChat({ runtime, chatSessionId: "chat-1" }, "Add a test");
		expect(prompt.mock.calls[0]?.[0]).toMatchObject({
			sessionId: "chat-1",
			content: [{ type: "text", text: "Add a test" }],
		});
	});
});

describe("interruptChat", () => {
	it("cancels the running turn", () => {
		const { runtime, cancelTurn } = fakeRuntime({
			turns: [
				{ id: "turn-0", status: "completed" },
				{ id: "turn-1", status: "running" },
			],
		});
		expect(interruptChat({ runtime, chatSessionId: "chat-1" })).toBe(true);
		expect(cancelTurn.mock.calls[0]?.[0]).toMatchObject({
			sessionId: "chat-1",
			turnId: "turn-1",
		});
	});

	it("does nothing when no turn is running", () => {
		const { runtime, cancelTurn } = fakeRuntime({
			turns: [{ id: "turn-0", status: "completed" }],
		});
		expect(interruptChat({ runtime, chatSessionId: "chat-1" })).toBe(false);
		expect(cancelTurn).not.toHaveBeenCalled();
	});
});

describe("chatTranscriptText", () => {
	it("renders messages, tool calls, and pending approvals in order", () => {
		const { runtime } = fakeRuntime({
			items: [
				{
					id: "u1",
					kind: "user_message",
					content: [{ type: "text", text: "Fix the build" }],
				},
				{
					id: "t1",
					kind: "tool_call",
					title: "Run bun test",
					toolKind: "execute",
					toolName: "Bash",
					status: "completed",
					content: [],
				},
				{
					id: "a1",
					kind: "approval_request",
					targetItemId: null,
					title: "Edit package.json",
					status: "pending",
				},
				{ id: "m1", kind: "agent_message", text: "Fixed it." },
				{
					id: "u2",
					kind: "user_message",
					discarded: true,
					content: [{ type: "text", text: "never sent" }],
				},
			],
		});
		expect(chatTranscriptText({ runtime, chatSessionId: "chat-1" })).toBe(
			[
				"User: Fix the build",
				"[tool completed] Run bun test",
				"[waiting for approval] Edit package.json",
				"Agent: Fixed it.",
			].join("\n\n"),
		);
	});
});
