import { findPanePath, type WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { FilePaneData, PaneViewerData } from "../../../../../../types";

const FILE_AREA_SPLIT_PERCENTAGE = 65;

/**
 * Opens a file from the Files tab tree. A plain open shows it in the
 * preview (unpinned) file tab; `pin` keeps it open as its own tab.
 */
export function openFileInFilesTab({
	store,
	tabId,
	treePaneId,
	filePath,
	pin = false,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	tabId: string;
	treePaneId: string;
	filePath: string;
	pin?: boolean;
}): void {
	const state = store.getState();
	const tab = state.getTab(tabId);
	if (!tab) return;
	const filePanes = Object.values(tab.panes).filter(
		(pane) => pane.kind === "file",
	);
	const activate = (paneId: string) => {
		if (pin) {
			state.setPanePinned({ paneId, pinned: true });
			state.focusPane(paneId);
		} else {
			state.setActivePane({ tabId, paneId });
		}
	};

	const open = filePanes.find(
		(pane) => (pane.data as FilePaneData).filePath === filePath,
	);
	if (open) {
		activate(open.id);
		return;
	}

	const data: FilePaneData = { filePath, mode: "editor" };
	const preview = filePanes.find((pane) => !pane.pinned);
	if (preview) {
		state.setPaneData({ paneId: preview.id, data });
		activate(preview.id);
		return;
	}

	const newPane = { kind: "file", pinned: pin || undefined, data };
	const visible = filePanes.find(
		(pane) => findPanePath(tab.layout, pane.id) !== null,
	);
	if (visible) {
		state.stackPane({ tabId, paneId: visible.id, newPane, focus: pin });
		return;
	}
	const treePath = findPanePath(tab.layout, treePaneId);
	if (!treePath) return;
	state.splitPane({
		tabId,
		paneId: treePaneId,
		position: "left",
		newPane,
		focus: pin,
	});
	state.resizeSplit({
		tabId,
		path: treePath,
		splitPercentage: FILE_AREA_SPLIT_PERCENTAGE,
	});
}
