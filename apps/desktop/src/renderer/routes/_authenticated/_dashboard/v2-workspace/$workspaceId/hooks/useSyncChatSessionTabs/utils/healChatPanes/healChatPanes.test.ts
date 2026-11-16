import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import { healChatPanes } from "./healChatPanes";

const NOW = 1_000_000;

const newStore = () => createWorkspaceStore<PaneViewerData>();

function addChat(
	store: ReturnType<typeof newStore>,
	sessionId: string,
	terminalId: string,
) {
	store.getState().addTab({
		panes: [
			{
				kind: "chat-v3",
				data: { terminalId, sessionId, agent: { id: "claude" } },
			},
		],
	});
	return store.getState().tabs.at(-1)?.id as string;
}

const chats = (store: ReturnType<typeof newStore>) =>
	store.getState().tabs.flatMap((tab) =>
		Object.values(tab.panes).map((pane) => {
			const { sessionId, terminalId } = pane.data as ChatPaneData;
			return `${sessionId}@${terminalId}`;
		}),
	);

const listed = (
	sessionId: string,
	overrides: Partial<{
		live: boolean;
		closedAt: number;
		terminalId: string | null;
		updatedAt: number;
	}> = {},
) => ({
	sessionId,
	harness: "claude-acp",
	harnessSessionId: "native-shared",
	title: null,
	updatedAt: NOW,
	live: false,
	terminalId: null,
	...overrides,
});

const closedOnDesktop = listed("desktop", {
	closedAt: NOW,
	updatedAt: NOW - 1,
});

describe("healChatPanes", () => {
	it("moves the tab onto the chat resumed on mobile and closes the copy adopted for it", () => {
		const store = newStore();
		const originalTab = addChat(store, "desktop", "desktop-terminal");
		addChat(store, "resumed-on-phone", "resumed-on-phone");

		healChatPanes({
			paneStores: [store],
			sessions: [closedOnDesktop, listed("resumed-on-phone", { live: true })],
		});

		expect(chats(store)).toEqual(["resumed-on-phone@desktop-terminal"]);
		expect(store.getState().activeTabId).toBe(originalTab);
	});

	it("selects the kept tab in the other pane store when the selected copy is closed", () => {
		const main = newStore();
		const sidebar = newStore();
		const keptTab = addChat(main, "chat", "desktop-terminal");
		addChat(main, "other", "other-terminal");
		addChat(sidebar, "chat", "chat");

		healChatPanes({
			paneStores: [main, sidebar],
			sessions: [listed("chat", { live: true }), listed("other")],
		});

		expect(chats(sidebar)).toEqual([]);
		expect(main.getState().activeTabId).toBe(keptTab);
	});

	it("leaves a pane on a closed chat alone when another pane holds the resumed chat's terminal", () => {
		const store = newStore();
		addChat(store, "desktop", "terminal-1");
		addChat(store, "running", "terminal-2");

		healChatPanes({
			paneStores: [store],
			sessions: [
				closedOnDesktop,
				listed("running", { live: true, terminalId: "terminal-2" }),
			],
		});

		expect(chats(store)).toEqual(["desktop@terminal-1", "running@terminal-2"]);
	});

	it("keeps the pane on the chat's host terminal when two panes show the chat", () => {
		const store = newStore();
		addChat(store, "chat", "terminal-1");
		addChat(store, "chat", "terminal-2");

		healChatPanes({
			paneStores: [store],
			sessions: [listed("chat", { live: true, terminalId: "terminal-2" })],
		});

		expect(chats(store)).toEqual(["chat@terminal-2"]);
	});
});
