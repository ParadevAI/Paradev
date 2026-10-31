import type { WorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { StoreApi } from "zustand";

export type PaneLayoutSlot = "paneLayout" | "rightPaneLayout";

type PaneLayoutStore = StoreApi<WorkspaceStore<PaneViewerData>>;

const stores = new Map<string, PaneLayoutStore>();

const storeKey = (workspaceId: string, slot: PaneLayoutSlot) =>
	`${workspaceId}:${slot}`;

/** Pane layouts mounted in this renderer, so outside edits apply live. */
export function registerV2PaneLayoutStore(
	workspaceId: string,
	slot: PaneLayoutSlot,
	store: PaneLayoutStore,
): () => void {
	const key = storeKey(workspaceId, slot);
	stores.set(key, store);
	return () => {
		if (stores.get(key) === store) stores.delete(key);
	};
}

export function getV2PaneLayoutStore(
	workspaceId: string,
	slot: PaneLayoutSlot,
): PaneLayoutStore | undefined {
	return stores.get(storeKey(workspaceId, slot));
}
