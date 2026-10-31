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
	const anchor = state.getPane(anchorPaneId);
	const tab = anchor ? state.getTab(anchor.tabId) : null;
	if (!anchor || !tab) {
		state.openPane({ pane });
		return;
	}
	// Placed here, not by openPane: the right pane area's placePane opens every pane as a tab.
	const reusable = Object.values(tab.panes).find(
		(candidate) =>
			candidate.kind === pane.kind &&
			!candidate.pinned &&
			candidate.id !== anchorPaneId,
	);
	if (reusable) {
		state.setPaneData({ paneId: reusable.id, data: pane.data });
		state.focusPane(reusable.id);
		return;
	}
	state.splitPane({
		tabId: tab.id,
		paneId: anchorPaneId,
		position: "left",
		newPane: pane,
	});
}
