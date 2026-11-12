import { expect, test } from "bun:test";
import { forkedChatPaneData } from "./forkedChatPaneData";

test("a fork keeps the agent and chat settings but not the agent session or prompts", () => {
	expect(
		forkedChatPaneData(
			{
				terminalId: "t-source",
				sessionId: "s-source",
				agent: { id: "claude", sessionId: "harness-1" },
				chatModelId: "opus",
				chatModeId: "plan",
				chatTitle: "Fix the build",
				pendingPrompt: "not carried",
			},
			{ sessionId: "s-fork", terminalId: "t-fork" },
		),
	).toEqual({
		terminalId: "t-fork",
		sessionId: "s-fork",
		agent: { id: "claude" },
		chatModelId: "opus",
		chatModeId: "plan",
		chatTitle: "Fix the build",
	});
});
