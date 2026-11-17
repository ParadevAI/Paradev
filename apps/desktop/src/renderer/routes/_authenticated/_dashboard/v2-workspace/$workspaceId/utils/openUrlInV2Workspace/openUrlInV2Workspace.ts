import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { BrowserPaneData, PaneViewerData } from "../../types";

export type V2WorkspaceUrlOpenTarget = "current-tab" | "new-tab";

export function openUrlInV2Workspace({
	store,
	target,
	url,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	target: V2WorkspaceUrlOpenTarget;
	url: string;
}): string | null {
	const pane = {
		kind: "browser",
		data: { url } satisfies BrowserPaneData,
	};
	const state = store.getState();

	if (target === "new-tab") {
		state.addTab({ panes: [pane] });
	} else {
		state.openPane({ pane });
	}
	const next = store.getState();
	return (
		next.tabs.find((tab) => tab.id === next.activeTabId)?.activePaneId ?? null
	);
}
