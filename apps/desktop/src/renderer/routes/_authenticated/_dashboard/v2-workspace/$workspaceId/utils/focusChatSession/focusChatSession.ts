import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { ChatPaneData, PaneViewerData } from "../../types";
import { reopenChatSession } from "../closedChatSessions";
import { removePendingChatStop } from "../pendingChatStops";

export interface ChatSessionTarget {
	sessionId: string | null;
	presetId: string;
	harnessSessionId?: string;
	terminalId?: string;
	title?: string;
}

export function focusChatSession({
	store,
	linkedStores = [],
	session,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores?: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
	session: ChatSessionTarget;
}): "focused" | "added" {
	if (session.sessionId) {
		reopenChatSession(session.sessionId);
		removePendingChatStop(session.sessionId);
	}
	for (const paneStore of [store, ...linkedStores]) {
		for (const tab of paneStore.getState().tabs) {
			const pane = Object.values(tab.panes).find((pane) => {
				if (pane.kind !== "chat-v3") return false;
				const data = pane.data as ChatPaneData;
				return (
					(session.sessionId !== null &&
						data.sessionId === session.sessionId) ||
					(data.agent?.id === session.presetId &&
						session.harnessSessionId !== undefined &&
						data.agent?.sessionId === session.harnessSessionId)
				);
			});
			if (pane) {
				paneStore.getState().setActiveTab(tab.id);
				paneStore.getState().setActivePane({ tabId: tab.id, paneId: pane.id });
				return "focused";
			}
		}
	}
	store.getState().addTab({
		panes: [
			{
				kind: "chat-v3",
				data: {
					terminalId: session.terminalId ?? crypto.randomUUID(),
					sessionId: session.sessionId,
					agent: {
						id: session.presetId,
						...(session.harnessSessionId
							? { sessionId: session.harnessSessionId }
							: {}),
					},
					...(session.title ? { chatTitle: session.title } : {}),
				} satisfies ChatPaneData,
			},
		],
	});
	return "added";
}
