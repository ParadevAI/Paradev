import { transferTabToIndex, type WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

type Store = StoreApi<WorkspaceStore<PaneViewerData>>;

/** Undoes an expansion saved by builds that expanded by moving the center's tabs right. */
export function restoreExpandedPaneArea({
	center,
	right,
	snapshot,
}: {
	center: Store;
	right: Store;
	snapshot: {
		movedTabIds: string[];
		centerActiveTabId: string | null;
		rightActiveTabId: string | null;
	};
}): void {
	for (const tabId of snapshot.movedTabIds) {
		transferTabToIndex({ source: right, target: center, tabId });
	}
	for (const [store, tabId] of [
		[center, snapshot.centerActiveTabId],
		[right, snapshot.rightActiveTabId],
	] as const) {
		if (tabId && store.getState().getTab(tabId)) {
			store.getState().setActiveTab(tabId);
		}
	}
}
