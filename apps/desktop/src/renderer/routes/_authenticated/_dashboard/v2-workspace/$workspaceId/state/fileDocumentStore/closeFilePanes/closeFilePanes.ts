import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { FilePaneData, PaneViewerData } from "../../../types";

export function closeFilePanes(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	absolutePath: string,
	isDirectory: boolean,
): void {
	const state = store.getState();
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "file") continue;
			const { filePath } = pane.data as FilePaneData;
			const deleted =
				filePath === absolutePath ||
				(isDirectory && filePath.startsWith(`${absolutePath}/`));
			if (deleted) state.closePane({ tabId: tab.id, paneId: pane.id });
		}
	}
}
