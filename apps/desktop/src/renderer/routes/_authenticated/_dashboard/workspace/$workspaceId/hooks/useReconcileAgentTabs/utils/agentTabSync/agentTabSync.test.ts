import { describe, expect, it } from "bun:test";
import { type CreatePaneInput, createWorkspaceStore } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import type { ListedChatSession } from "../chatConversations";
import {
	createAgentTabSync,
	type HostLists,
	showStoredChats,
	syncWithHost,
	type WorkspacePaneStores,
} from "./agentTabSync";

const chat = (
	sessionId: string,
	overrides: Partial<ListedChatSession> = {},
): ListedChatSession => ({
	sessionId,
	harness: "claude-acp",
	harnessSessionId: `native-${sessionId}`,
	title: null,
	updatedAt: 1,
	live: true,
	terminalId: `terminal-${sessionId}`,
	closedAt: null,
	closedByUser: false,
	...overrides,
});

function workspace(): WorkspacePaneStores {
	return {
		main: createWorkspaceStore<PaneViewerData>(),
		linked: [createWorkspaceStore<PaneViewerData>()],
	};
}

const workspaceId = "workspace-sync-test";

const shownSessions = (stores: WorkspacePaneStores) =>
	stores.main
		.getState()
		.tabs.flatMap((tab) => Object.values(tab.panes))
		.flatMap((pane) =>
			pane.kind === "chat-v3" ? [(pane.data as ChatPaneData).sessionId] : [],
		);

const selectedSession = (stores: WorkspacePaneStores) => {
	const { tabs, activeTabId } = stores.main.getState();
	const active = tabs.find((tab) => tab.id === activeTabId);
	const pane = active && Object.values(active.panes)[0];
	return pane?.kind === "chat-v3"
		? (pane.data as ChatPaneData).sessionId
		: null;
};

const live = new AbortController().signal;

const sync = (
	state: ReturnType<typeof createAgentTabSync>,
	stores: WorkspacePaneStores,
	lists: HostLists,
	signal = live,
) =>
	syncWithHost(state, {
		stores,
		workspaceId,
		signal,
		read: async () => lists,
	});

const stored = (
	state: ReturnType<typeof createAgentTabSync>,
	stores: WorkspacePaneStores,
	chats: ListedChatSession[],
) =>
	showStoredChats(state, {
		stores,
		workspaceId,
		signal: live,
		read: async () => chats,
	});

const fileTab: { panes: [CreatePaneInput<PaneViewerData>] } = {
	panes: [{ kind: "file", data: { filePath: "a.ts", mode: "editor" } }],
};

describe("agentTabSync", () => {
	it("a workspace that opened empty selects its newest chat, even when setup tabs land while the host is read", async () => {
		const stores = workspace();
		await syncWithHost(createAgentTabSync(), {
			stores,
			workspaceId,
			signal: live,
			read: async () => {
				stores.main.getState().addTab({
					panes: [{ kind: "terminal", data: { terminalId: "setup" } }],
				});
				return {
					chats: [
						chat("older", { updatedAt: 1 }),
						chat("newest", { updatedAt: 2 }),
					],
					terminals: [{ terminalId: "setup" }],
				};
			},
		});
		expect(selectedSession(stores)).toBe("newest");
	});

	it("keeps the user's tab once the host has listed a chat", async () => {
		const stores = workspace();
		const state = createAgentTabSync();
		await sync(state, stores, { chats: [chat("first")] });
		stores.main.getState().addTab(fileTab);
		const mine = stores.main.getState().activeTabId;
		await sync(state, stores, {
			chats: [chat("first"), chat("second", { updatedAt: 2 })],
		});
		expect(shownSessions(stores)).toEqual(["first", "second"]);
		expect(stores.main.getState().activeTabId).toBe(mine);
	});

	it("shows a cloud workspace's stored chats once, and the box's list closes the ones it closed", async () => {
		const stores = workspace();
		const state = createAgentTabSync();
		await stored(state, stores, [
			chat("kept", { live: false }),
			chat("gone", { live: false }),
		]);
		await stored(state, stores, [chat("again")]);
		expect(shownSessions(stores)).toEqual(["kept", "gone"]);
		await sync(state, stores, {
			chats: [chat("kept"), chat("gone", { live: false, closedAt: 5 })],
		});
		expect(shownSessions(stores)).toEqual(["kept"]);
	});

	it("does not show stored chats in a workspace that opened with tabs, or after the box answered", async () => {
		const withTabs = workspace();
		withTabs.main.getState().addTab(fileTab);
		await stored(createAgentTabSync(), withTabs, [chat("s")]);
		expect(shownSessions(withTabs)).toEqual([]);

		const answered = workspace();
		const state = createAgentTabSync();
		await sync(state, answered, { chats: [] });
		await stored(state, answered, [chat("s")]);
		expect(shownSessions(answered)).toEqual([]);
	});

	it("reconciles terminals when the chat list failed", async () => {
		const stores = workspace();
		const { changed } = await sync(createAgentTabSync(), stores, {
			terminals: [{ terminalId: "shell" }],
		});
		expect(changed).toBe(true);
		expect(stores.main.getState().tabs).toHaveLength(1);
	});

	it("leaves the tabs alone when the read was cancelled", async () => {
		const stores = workspace();
		const cancelled = new AbortController();
		cancelled.abort();
		await sync(
			createAgentTabSync(),
			stores,
			{ chats: [chat("late")] },
			cancelled.signal,
		);
		expect(stores.main.getState().tabs).toHaveLength(0);
	});
});
