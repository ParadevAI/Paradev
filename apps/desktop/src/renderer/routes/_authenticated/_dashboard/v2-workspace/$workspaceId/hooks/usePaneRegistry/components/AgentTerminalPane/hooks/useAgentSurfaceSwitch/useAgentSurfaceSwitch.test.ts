import { describe, expect, it } from "bun:test";
import { chatPaneDataForTerminal } from "./useAgentSurfaceSwitch";

describe("chatPaneDataForTerminal", () => {
	const agent = { id: "claude", sessionId: "agent-session" };

	it("attaches to the chat already running on the terminal", () => {
		expect(
			chatPaneDataForTerminal({
				terminalId: "terminal-1",
				agent,
				binding: { chatSessionId: "chat-1" },
			}),
		).toEqual({ terminalId: "terminal-1", sessionId: "chat-1", agent });
	});

	it("starts a chat for a terminal agent", () => {
		expect(
			chatPaneDataForTerminal({
				terminalId: "terminal-1",
				agent,
				binding: {},
			}),
		).toEqual({ terminalId: "terminal-1", sessionId: null, agent });
		expect(
			chatPaneDataForTerminal({
				terminalId: "terminal-1",
				agent,
				binding: undefined,
			}),
		).toEqual({ terminalId: "terminal-1", sessionId: null, agent });
	});
});
