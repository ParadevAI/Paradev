import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { BrowserPaneData, PaneViewerData } from "../../types";

export type V2WorkspaceUrlOpenTarget = "current-tab" | "new-tab";

export function openUrlInV2Workspace({
	store,
	target,
	url,
	paneId,
	focus,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	target: V2WorkspaceUrlOpenTarget;
	url: string;
	paneId?: string;
	focus?: boolean;
}): void {
	const pane = {
		id: paneId,
		kind: "browser",
		data: { url } satisfies BrowserPaneData,
	};
	const state = store.getState();

	if (target === "new-tab") {
		state.addTab({ panes: [pane], focus });
		return;
	}

	state.openPane({ pane, focus });
}
