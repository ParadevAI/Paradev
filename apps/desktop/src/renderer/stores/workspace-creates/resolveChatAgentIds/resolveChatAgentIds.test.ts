import { describe, expect, it } from "bun:test";
import { resolveChatAgentIds } from "./resolveChatAgentIds";

function clientWith(harness: string | null, failures = 0) {
	const calls: string[] = [];
	return {
		calls,
		client: {
			sessions: {
				get: {
					query: async ({ sessionId }: { sessionId: string }) => {
						calls.push(sessionId);
						if (!harness || calls.length <= failures)
							throw new Error("No procedure");
						return { session: { harness } };
					},
				},
			},
		} as never,
	};
}

const chatLaunch: {
	ok: true;
	kind: "terminal";
	sessionId: string;
	label: string;
	chatSessionId: string;
	chatAgentId?: string;
} = {
	ok: true,
	kind: "terminal",
	sessionId: "terminal-1",
	label: "Claude",
	chatSessionId: "chat-1",
};

describe("resolveChatAgentIds", () => {
	it("reads the agent from the chat session when the host did not send it", async () => {
		const { client, calls } = clientWith("claude-acp");
		const [entry] = await resolveChatAgentIds(client, "ws-1", [chatLaunch]);

		expect(calls).toEqual(["chat-1"]);
		expect(entry).toEqual({ ...chatLaunch, chatAgentId: "claude" });
	});

	it("keeps a host-provided agent and leaves terminal launches alone", async () => {
		const { client, calls } = clientWith("claude-acp");
		const terminal = {
			ok: true as const,
			kind: "terminal" as const,
			sessionId: "t",
			label: "Codex",
		};
		const agents = [{ ...chatLaunch, chatAgentId: "codex" }, terminal];

		expect(await resolveChatAgentIds(client, "ws-1", agents)).toEqual(agents);
		expect(calls).toEqual([]);
	});

	it("retries a failed lookup", async () => {
		const { client, calls } = clientWith("claude-acp", 1);
		const [entry] = await resolveChatAgentIds(client, "ws-1", [chatLaunch], {
			retryDelayMs: 0,
		});

		expect(calls).toEqual(["chat-1", "chat-1"]);
		expect(entry).toEqual({ ...chatLaunch, chatAgentId: "claude" });
	});

	it("leaves the agent unset when the host cannot answer", async () => {
		const { client, calls } = clientWith(null);
		const [entry] = await resolveChatAgentIds(client, "ws-1", [chatLaunch], {
			retryDelayMs: 0,
		});

		expect(calls).toHaveLength(3);
		expect(entry).toEqual(chatLaunch);
	});
});
