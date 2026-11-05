import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export function openBesidePane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	anchorPaneId: string,
	pane: CreatePaneInput<PaneViewerData>,
	openInNewTab?: boolean,
): void {
	const state = store.getState();
	if (openInNewTab) {
		state.addTab({ panes: [pane] });
		return;
	}
	state.openPane({ pane, beside: anchorPaneId });
}
