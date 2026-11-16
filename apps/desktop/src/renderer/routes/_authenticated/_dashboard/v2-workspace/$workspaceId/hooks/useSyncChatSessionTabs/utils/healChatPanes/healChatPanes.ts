import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import { chatPanesResumedElsewhere } from "../chatPanesResumedElsewhere";
import type { ListedChatSession } from "../chatSessionsToAdopt";
import { duplicateChatPanes } from "../duplicateChatPanes";

/** Moves panes onto chats resumed elsewhere, then closes panes that repeat a chat. */
export function healChatPanes({
	paneStores,
	sessions,
}: {
	paneStores: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
	sessions: readonly ListedChatSession[];
}): void {
	const allTabs = paneStores.flatMap((paneStore) => paneStore.getState().tabs);
	for (const { paneId, sessionId } of chatPanesResumedElsewhere(
		sessions,
		allTabs,
	)) {
		for (const paneStore of paneStores) {
			const state = paneStore.getState();
			const found = state.getPane(paneId);
			if (!found) continue;
			const data = found.pane.data as ChatPaneData;
			state.setPaneData({ paneId, data: { ...data, sessionId } });
		}
	}
	const duplicates = duplicateChatPanes(
		paneStores.map((paneStore) => paneStore.getState().tabs),
		new Map(sessions.map((session) => [session.sessionId, session.terminalId])),
	);
	for (const { store, tabId, paneId, kept } of duplicates) {
		const paneStore = paneStores[store];
		if (!paneStore) continue;
		const wasActive = paneStore.getState().activeTabId === tabId;
		paneStore.getState().closePane({ tabId, paneId, intent: "remove" });
		const tabRemoved = !paneStore
			.getState()
			.tabs.some((tab) => tab.id === tabId);
		if (wasActive && tabRemoved)
			paneStores[kept.store]?.getState().setActiveTab(kept.tabId);
	}
}
