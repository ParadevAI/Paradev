import { describe, expect, it } from "bun:test";
import { recoverAgentLaunches } from "./recoverAgentLaunches";

function client(bindings: unknown[] | Error) {
	return {
		terminalAgents: {
			listByWorkspace: {
				query: async () => {
					if (bindings instanceof Error) throw bindings;
					return bindings;
				},
			},
		},
		sessions: {
			get: { query: async () => ({ session: { harness: "claude-acp" } }) },
		},
	} as never;
}

describe("recoverAgentLaunches", () => {
	it("turns live bindings into launches, with the chat's agent read by session id", async () => {
		const launches = await recoverAgentLaunches(
			client([
				{ terminalId: "t-1", agentId: "codex" },
				{ terminalId: "t-2", agentId: "claude", chatSessionId: "chat-1" },
				{ terminalId: "t-3", agentId: "claude", endedAt: 5 },
			]),
			"ws-1",
		);

		expect(launches as unknown[]).toEqual([
			{ ok: true, kind: "terminal", sessionId: "t-1", label: "" },
			{
				ok: true,
				kind: "terminal",
				sessionId: "t-2",
				label: "",
				chatSessionId: "chat-1",
				chatAgentId: "claude",
			},
		]);
	});

	it("recovers nothing when the host cannot be asked", async () => {
		expect(
			await recoverAgentLaunches(client(new Error("down")), "ws-1"),
		).toEqual([]);
	});
});
