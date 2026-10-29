import type { WorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { StoreApi } from "zustand";

type PaneLayoutStore = StoreApi<WorkspaceStore<PaneViewerData>>;
export type PaneLayoutSlot = "paneLayout" | "rightPaneLayout";

const stores = new Map<string, PaneLayoutStore>();

function storeKey(workspaceId: string, slot: PaneLayoutSlot): string {
	return `${workspaceId}:${slot}`;
}

/** Pane layouts mounted in this renderer, so outside edits apply live. */
export function registerV2PaneLayoutStore(
	workspaceId: string,
	store: PaneLayoutStore,
	slot: PaneLayoutSlot = "paneLayout",
): () => void {
	const key = storeKey(workspaceId, slot);
	stores.set(key, store);
	return () => {
		if (stores.get(key) === store) stores.delete(key);
	};
}

export function getV2PaneLayoutStore(
	workspaceId: string,
	slot: PaneLayoutSlot = "paneLayout",
): PaneLayoutStore | undefined {
	return stores.get(storeKey(workspaceId, slot));
}
