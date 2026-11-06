import { afterEach, describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import {
	type PaneViewerData,
	PENDING_CLOUD_CHAT_PANE_KIND,
} from "../../../../types";
import {
	ignoreChatTerminal,
	markChatSessionClosed,
} from "../../../../utils/closedChatSessions";
import {
	addPendingChatStop,
	removePendingChatStop,
} from "../../../../utils/pendingChatStops";
import { CHAT_ADOPT_MAX_LIVE_CHATS } from "../../constants";
import { chatSessionsToAdopt } from "./chatSessionsToAdopt";

const NOW = 1_000_000;
const WORKSPACE_ID = "workspace-1";

const listed = (sessionId: string, overrides = {}) => ({
	sessionId,
	harness: "claude-acp",
	harnessSessionId: `native-${sessionId}`,
	title: `Chat ${sessionId}`,
	updatedAt: NOW - 1000,
	live: true,
	terminalId: `terminal-${sessionId}`,
	...overrides,
});

const adoptedIds = (
	sessions: ReturnType<typeof listed>[],
	tabs = createWorkspaceStore<PaneViewerData>().getState().tabs,
) =>
	chatSessionsToAdopt({
		sessions,
		tabs,
		workspaceId: WORKSPACE_ID,
	}).map((target) => target.sessionId);

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("chatSessionsToAdopt", () => {
	it("adopts live chats no pane shows, oldest first", () => {
		expect(
			chatSessionsToAdopt({
				sessions: [
					listed("new", { updatedAt: NOW - 1 }),
					listed("old", { updatedAt: NOW - 2 }),
				],
				tabs: [],
				workspaceId: WORKSPACE_ID,
			}),
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

	it("adopts a chat started without a terminal under its session id", () => {
		const [target] = chatSessionsToAdopt({
			sessions: [listed("mobile", { terminalId: null })],
			tabs: [],
			workspaceId: WORKSPACE_ID,
		});
		expect(target?.terminalId).toBe("mobile");
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
		cleanups.push(markChatSessionClosed("closed"));
		expect(
			adoptedIds(
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
	});

	it("adopts a chat however long it was idle, but only among the most recent live chats", () => {
		const sessions = Array.from(
			{ length: CHAT_ADOPT_MAX_LIVE_CHATS + 2 },
			(_, index) => listed(`chat-${index}`, { updatedAt: index }),
		);
		const adopted = adoptedIds(sessions);
		expect(adopted).toHaveLength(CHAT_ADOPT_MAX_LIVE_CHATS);
		expect(adopted).not.toContain("chat-0");
		expect(adopted).not.toContain("chat-1");
		expect(adopted.at(-1)).toBe(`chat-${CHAT_ADOPT_MAX_LIVE_CHATS + 1}`);
	});

	it("skips chats on an ignored terminal, such as a closed tab's or a fork loader's", () => {
		cleanups.push(ignoreChatTerminal("terminal-stray"));
		expect(adoptedIds([listed("stray"), listed("other")])).toEqual(["other"]);
	});

	it("skips chats another window is stopping, by session or terminal", () => {
		addPendingChatStop(WORKSPACE_ID, "stopping");
		addPendingChatStop(WORKSPACE_ID, "replaced", "terminal-leaked");
		addPendingChatStop("other-workspace", "elsewhere");
		cleanups.push(
			() => removePendingChatStop("stopping"),
			() => removePendingChatStop("replaced"),
			() => removePendingChatStop("elsewhere"),
		);
		expect(
			adoptedIds([listed("stopping"), listed("leaked"), listed("elsewhere")]),
		).toEqual(["elsewhere"]);
	});
});
