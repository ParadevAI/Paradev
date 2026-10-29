import type { WorkspaceStore } from "@superset/panes";
import { useEffect } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { moveViewerPanesToRight } from "./utils/moveViewerPanesToRight";

export function useRightPaneAreaLifecycle({
	centerStore,
	rightStore,
	isReady,
}: {
	centerStore: StoreApi<WorkspaceStore<PaneViewerData>>;
	rightStore: StoreApi<WorkspaceStore<PaneViewerData>>;
	isReady: boolean;
}): void {
	useEffect(() => {
		if (!isReady) return;
		const enforce = () =>
			moveViewerPanesToRight({ center: centerStore, right: rightStore });
		enforce();
		return centerStore.subscribe(enforce);
	}, [centerStore, rightStore, isReady]);
}
