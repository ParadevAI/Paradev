import {
	type Pane,
	transferPaneToNewTab,
	type WorkspaceStore,
} from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { DiffPaneData, PaneViewerData } from "../../../../types";
import { CENTER_PANE_KINDS } from "../../constants";

type Store = StoreApi<WorkspaceStore<PaneViewerData>>;

export function moveViewerPanesToRight({
	center,
	right,
}: {
	center: Store;
	right: Store;
}): void {
	for (const tab of center.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (CENTER_PANE_KINDS.has(pane.kind)) continue;
			const rightDiff =
				pane.kind === "diff" && !pane.pinned
					? findUnpinnedDiffPane(right)
					: null;
			if (rightDiff) {
				foldIntoDiffPane(right, rightDiff, pane.data as DiffPaneData);
				center
					.getState()
					.closePane({ tabId: tab.id, paneId: pane.id, intent: "remove" });
				continue;
			}
			transferPaneToNewTab({ source: center, target: right, paneId: pane.id });
		}
	}
}

function findUnpinnedDiffPane(
	store: Store,
): { tabId: string; pane: Pane<PaneViewerData> } | null {
	for (const tab of store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind === "diff" && !pane.pinned) return { tabId: tab.id, pane };
		}
	}
	return null;
}

function foldIntoDiffPane(
	store: Store,
	target: { tabId: string; pane: Pane<PaneViewerData> },
	moved: DiffPaneData,
): void {
	const state = store.getState();
	if (moved.path) {
		const prev = target.pane.data as DiffPaneData;
		state.setPaneData({
			paneId: target.pane.id,
			data: {
				...prev,
				path: moved.path,
				changeKey: moved.changeKey,
				collapsedFiles: moved.changeKey
					? (prev.collapsedFiles ?? []).filter((key) => key !== moved.changeKey)
					: (prev.collapsedFiles ?? []),
				focusLine: moved.focusLine,
				focusSide: moved.focusSide,
				focusTick: Date.now(),
			} as PaneViewerData,
		});
	}
	state.setActiveTab(target.tabId);
	state.setActivePane({ tabId: target.tabId, paneId: target.pane.id });
}
