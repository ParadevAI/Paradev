import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import {
	type PaneViewerData,
	PENDING_CLOUD_CHAT_PANE_KIND,
} from "../../../../types";
import {
	markChatSessionClosed,
	reopenChatSession,
} from "../../../../utils/closedChatSessions";
import { chatSessionsToAdopt } from "./chatSessionsToAdopt";

const listed = (sessionId: string, overrides = {}) => ({
	sessionId,
	harness: "claude-acp",
	harnessSessionId: `native-${sessionId}`,
	title: `Chat ${sessionId}`,
	updatedAt: 1,
	live: true,
	terminalId: `terminal-${sessionId}`,
	...overrides,
});

describe("chatSessionsToAdopt", () => {
	it("adopts live chats no pane shows, oldest first", () => {
		expect(
			chatSessionsToAdopt(
				[listed("new", { updatedAt: 2 }), listed("old", { updatedAt: 1 })],
				[],
			),
		).toEqual([
			{
				sessionId: "old",
				presetId: "claude",
				harnessSessionId: "native-old",
				terminalId: "terminal-old",
				title: "Chat old",
			},
			{
				sessionId: "new",
				presetId: "claude",
				harnessSessionId: "native-new",
				terminalId: "terminal-new",
				title: "Chat new",
			},
		]);
	});

	it("skips dead, unsupported, closed, and already shown chats", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		store.getState().addTab({
			panes: [
				{
					kind: "chat-v3",
					data: {
						terminalId: "pane-terminal",
						sessionId: "shown",
						agent: { id: "claude" },
					},
				},
			],
		});
		store.getState().addTab({
			panes: [
				{
					kind: "chat-v3",
					data: {
						terminalId: "terminal-creating",
						sessionId: null,
						agent: { id: "claude" },
					},
				},
			],
		});
		store.getState().addTab({
			panes: [
				{
					kind: PENDING_CLOUD_CHAT_PANE_KIND,
					data: {
						draftId: "draft-1",
						agentId: "claude",
						terminalId: "terminal-pending",
					},
				},
			],
		});
		markChatSessionClosed("closed");
		try {
			expect(
				chatSessionsToAdopt(
					[
						listed("dead", { live: false }),
						listed("unknown", { harness: "unknown" }),
						listed("closed"),
						listed("shown"),
						listed("creating"),
						listed("pending"),
					],
					store.getState().tabs,
				),
			).toEqual([]);
		} finally {
			reopenChatSession("closed");
		}
	});
});
