import { expect, test } from "bun:test";
import { restartedChatPaneData } from "./restartedChatPaneData";

test("switching agent or rewinding keeps the composer draft of an attached cloud chat", () => {
	const next = restartedChatPaneData(
		{
			terminalId: "host-terminal",
			draftId: "pending-draft",
			sessionId: "old-session",
			agent: { id: "claude", sessionId: "native" },
			chatTitle: "Old",
		},
		{ agent: { id: "codex" }, pendingPrompt: "handoff" },
	);
	expect(next).toEqual({
		terminalId: "host-terminal",
		draftId: "pending-draft",
		sessionId: null,
		agent: { id: "codex" },
		pendingPrompt: "handoff",
	});
});

test("a chat that never had a separate draft id does not gain one", () => {
	expect(
		restartedChatPaneData(
			{ terminalId: "terminal", sessionId: "chat" },
			{ agent: { id: "codex" } },
		),
	).not.toHaveProperty("draftId");
});
