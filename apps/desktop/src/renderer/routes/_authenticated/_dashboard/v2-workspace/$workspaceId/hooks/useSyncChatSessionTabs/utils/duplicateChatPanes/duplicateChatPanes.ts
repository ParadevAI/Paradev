import type { Tab } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../../../types";

export interface ChatPaneRef {
	store: number;
	tabId: string;
	paneId: string;
}

/**
 * Chat panes that repeat another pane's chat, each with the pane kept: the one
 * on the chat's host terminal, then one on its own terminal, then the first.
 */
export function duplicateChatPanes(
	tabsByStore: readonly (readonly Tab<PaneViewerData>[])[],
	hostTerminalIds: ReadonlyMap<string, string | null> = new Map(),
): Array<ChatPaneRef & { kept: ChatPaneRef }> {
	const chatPanes = tabsByStore.flatMap((tabs, store) =>
		tabs.flatMap((tab) =>
			Object.values(tab.panes).flatMap((pane) => {
				if (pane.kind !== "chat-v3") return [];
				const { sessionId, terminalId } = pane.data as ChatPaneData;
				if (!sessionId) return [];
				const rank =
					hostTerminalIds.get(sessionId) === terminalId
						? 0
						: terminalId === sessionId
							? 2
							: 1;
				return [{ store, tabId: tab.id, paneId: pane.id, sessionId, rank }];
			}),
		),
	);
	const kept = new Map<string, ChatPaneRef>();
	for (const { sessionId, store, tabId, paneId } of [...chatPanes].sort(
		(a, b) => a.rank - b.rank,
	)) {
		if (!kept.has(sessionId)) kept.set(sessionId, { store, tabId, paneId });
	}
	return chatPanes.flatMap(({ sessionId, store, tabId, paneId }) => {
		const keptPane = kept.get(sessionId);
		if (!keptPane || keptPane.paneId === paneId) return [];
		return [{ store, tabId, paneId, kept: keptPane }];
	});
}
