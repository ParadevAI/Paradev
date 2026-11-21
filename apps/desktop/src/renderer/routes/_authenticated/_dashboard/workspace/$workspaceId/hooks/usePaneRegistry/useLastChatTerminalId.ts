import type { WorkspaceStore } from "@superset/panes";
import { useEffect, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { ChatPaneData, PaneViewerData } from "../../types";

export function useLastChatTerminalId(
	store: StoreApi<WorkspaceStore<PaneViewerData>> | undefined,
) {
	const [trackedStore, setTrackedStore] = useState(store);
	const [lastChat, setLastChat] = useState<string | null>(null);
	useEffect(() => {
		setTrackedStore(store);
		setLastChat(null);
		if (!store) return;
		const update = (state: WorkspaceStore<PaneViewerData>) => {
			const pane = state.getActivePane()?.pane;
			if (pane?.kind === "chat-v3")
				setLastChat((pane.data as ChatPaneData).terminalId);
			else if (pane?.kind !== "diff") setLastChat(null);
		};
		update(store.getState());
		return store.subscribe(update);
	}, [store]);
	return trackedStore === store ? lastChat : null;
}
