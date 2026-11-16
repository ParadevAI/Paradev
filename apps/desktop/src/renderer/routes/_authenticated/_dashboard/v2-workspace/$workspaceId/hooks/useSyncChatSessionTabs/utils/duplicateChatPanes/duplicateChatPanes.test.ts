import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { duplicateChatPanes } from "./duplicateChatPanes";

function addChat(
	store: ReturnType<typeof createWorkspaceStore<PaneViewerData>>,
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
	const tab = store.getState().tabs.at(-1);
	return {
		tabId: tab?.id as string,
		paneId: Object.keys(tab?.panes ?? {})[0] as string,
	};
}

describe("duplicateChatPanes", () => {
	it("keeps the pane on its own terminal and returns the one adopted under the chat's session id", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		const adopted = addChat(store, "resumed", "resumed");
		const original = addChat(store, "resumed", "desktop-terminal");
		addChat(store, "other", "other-terminal");

		expect(duplicateChatPanes([store.getState().tabs])).toEqual([
			{ store: 0, ...adopted, kept: { store: 0, ...original } },
		]);
	});

	it("finds a repeat in a linked store and keeps the first pane otherwise", () => {
		const main = createWorkspaceStore<PaneViewerData>();
		const linked = createWorkspaceStore<PaneViewerData>();
		const first = addChat(main, "chat", "terminal-a");
		const repeat = addChat(linked, "chat", "terminal-b");

		expect(
			duplicateChatPanes([main.getState().tabs, linked.getState().tabs]),
		).toEqual([{ store: 1, ...repeat, kept: { store: 0, ...first } }]);
	});
});
