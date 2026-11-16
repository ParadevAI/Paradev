import type { Tab } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../../../types";

interface ChatPaneRef {
	store: number;
	tabId: string;
	paneId: string;
}

/**
 * Chat panes that show a chat another pane already shows, across every pane
 * store, each with the pane it repeats. The pane kept is the first one opened
 * on its own terminal, before one opened under the chat's session id (adopted,
 * or opened by mobile through `panes.newTab`).
 */
export function duplicateChatPanes(
	tabsByStore: readonly (readonly Tab<PaneViewerData>[])[],
): Array<ChatPaneRef & { kept: ChatPaneRef }> {
	const chatPanes = tabsByStore.flatMap((tabs, store) =>
		tabs.flatMap((tab) =>
			Object.values(tab.panes).flatMap((pane) => {
				if (pane.kind !== "chat-v3") return [];
				const { sessionId, terminalId } = pane.data as ChatPaneData;
				if (!sessionId) return [];
				return [
					{
						store,
						tabId: tab.id,
						paneId: pane.id,
						sessionId,
						underSessionId: terminalId === sessionId,
					},
				];
			}),
		),
	);
	const kept = new Map<string, ChatPaneRef>();
	const byPreference = [...chatPanes].sort(
		(a, b) => Number(a.underSessionId) - Number(b.underSessionId),
	);
	for (const { sessionId, store, tabId, paneId } of byPreference) {
		if (!kept.has(sessionId)) kept.set(sessionId, { store, tabId, paneId });
	}
	return chatPanes.flatMap(({ sessionId, store, tabId, paneId }) => {
		const keptPane = kept.get(sessionId);
		if (!keptPane || keptPane.paneId === paneId) return [];
		return [{ store, tabId, paneId, kept: keptPane }];
	});
}
