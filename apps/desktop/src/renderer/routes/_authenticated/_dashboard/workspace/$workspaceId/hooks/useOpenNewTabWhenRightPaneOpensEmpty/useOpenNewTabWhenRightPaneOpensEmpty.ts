import type { WorkspaceStore } from "@superset/panes";
import { useLayoutEffect } from "react";
import type { StoreApi } from "zustand/vanilla";
import { NEW_TAB_PANE } from "../../components/RightPaneNewTab";
import type { PaneViewerData } from "../../types";

export function useOpenNewTabWhenRightPaneOpensEmpty({
	store,
	isOpen,
	enabled,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	isOpen: boolean;
	enabled: boolean;
}): void {
	// Tab count is read, not subscribed: closing the last tab must close the pane, not refill it.
	useLayoutEffect(() => {
		if (!enabled || !isOpen) return;
		const state = store.getState();
		if (state.tabs.length === 0) state.addTab({ panes: [NEW_TAB_PANE] });
	}, [store, isOpen, enabled]);
}
