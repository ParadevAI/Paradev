import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { ChatPaneData, PaneViewerData } from "../../types";

/** Focuses the tab already showing this agent session, or opens one. */
export function focusAgentSession({
	store,
	linkedStores = [],
	session,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores?: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
	session: { id: string; agentName: string };
}): "focused" | "added" {
	for (const paneStore of [store, ...linkedStores]) {
		for (const tab of paneStore.getState().tabs) {
			const pane = Object.values(tab.panes).find(
				(pane) =>
					pane.kind === "chat-v3" &&
					(pane.data as ChatPaneData).agentSession?.id === session.id,
			);
			if (pane) {
				paneStore.getState().focusPane(pane.id);
				return "focused";
			}
		}
	}
	store.getState().addTab({
		panes: [
			{
				kind: "chat-v3",
				titleOverride: session.agentName,
				data: {
					terminalId: crypto.randomUUID(),
					sessionId: null,
					agentSession: session,
					chatTitle: session.agentName,
				} satisfies ChatPaneData,
			},
		],
	});
	return "added";
}
