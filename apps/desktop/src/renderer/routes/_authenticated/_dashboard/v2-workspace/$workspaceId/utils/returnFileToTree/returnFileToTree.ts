import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

export function returnFileToTree(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	paneId: string,
): boolean {
	const state = store.getState();
	const location = state.getPane(paneId);
	if (location?.pane.kind !== "file") return false;
	const tab = state.getTab(location.tabId);
	if (!tab || Object.keys(tab.panes).length !== 1) return false;

	state.setPanePinned({ paneId, pinned: false });
	state.replacePane({
		tabId: location.tabId,
		paneId,
		newPane: { kind: "files", data: { kind: "files" } },
	});
	return true;
}
