import type { WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { restoreExpandedPaneArea } from "./utils/restoreExpandedPaneArea";

export function useRestoreExpandedPaneArea({
	workspaceId,
	centerStore,
	rightStore,
	isReady,
}: {
	workspaceId: string;
	centerStore: StoreApi<WorkspaceStore<PaneViewerData>>;
	rightStore: StoreApi<WorkspaceStore<PaneViewerData>>;
	isReady: boolean;
}): void {
	const collections = useCollections();
	useEffect(() => {
		if (!isReady) return;
		const snapshot =
			collections.v2WorkspaceLocalState.get(
				workspaceId,
			)?.rightPaneAreaExpansion;
		if (!snapshot) return;
		restoreExpandedPaneArea({
			center: centerStore,
			right: rightStore,
			snapshot,
		});
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			delete draft.rightPaneAreaExpansion;
		});
	}, [isReady, collections, workspaceId, centerStore, rightStore]);
}
