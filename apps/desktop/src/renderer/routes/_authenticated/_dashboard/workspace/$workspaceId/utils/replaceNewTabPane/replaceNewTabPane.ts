import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { getPaneKey } from "../getPaneKey";

export function replaceNewTabPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	target: { tabId: string; paneId: string },
	pane: CreatePaneInput<PaneViewerData>,
): void {
	const state = store.getState();
	const key = getPaneKey(pane);
	const open = key ? state.findPaneByKey(key) : null;
	if (open) {
		state.setPaneData({ paneId: open.pane.id, data: pane.data });
		state.focusPane(open.pane.id);
		return;
	}
	// A header click pins a pane, and replacePane skips pinned panes.
	state.setPanePinned({ paneId: target.paneId, pinned: false });
	state.replacePane({ ...target, newPane: pane });
	const opened = state.getActivePane(target.tabId);
	if (opened) state.focusPane(opened.pane.id);
}
