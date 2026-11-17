import type { WorkspaceStore } from "@superset/panes";
import type { ChangesOpenTarget } from "renderer/stores/settings";
import type { StoreApi } from "zustand/vanilla";
import type {
	DiffFocusSide,
	DiffPaneData,
	DiffPaneFilter,
	PaneViewerData,
} from "../../types";

export interface OpenDiffPaneArgs {
	filePath: string;
	openInNewTab?: boolean;
	line?: number;
	side?: DiffFocusSide;
	changeKey?: string;
	filter?: DiffPaneFilter;
}

/**
 * Point the workspace's diff pane at a file, creating one when none exists.
 *
 * `target` is the user's changesOpenTarget setting. It only matters when no
 * diff pane exists yet: "pane" splits the active tab, "tab" adds a dedicated
 * tab — the same placement openChangesPaneInStore uses for the top-bar button.
 */
export function openDiffPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	{ filePath, openInNewTab, line, side, changeKey, filter }: OpenDiffPaneArgs,
	target: ChangesOpenTarget = "pane",
): void {
	const state = store.getState();
	// Bump the tick on every request so repeat clicks re-scroll and a
	// navigation into an unmounted pane wins over its older cached position.
	const focusFields = {
		focusLine: line,
		focusSide: line != null ? side : undefined,
		focusTick: Date.now(),
		filter,
	};
	const newDiffPane = {
		kind: "diff",
		data: {
			path: filePath,
			changeKey,
			collapsedFiles: [],
			...focusFields,
		} as DiffPaneData,
	} as const;

	if (openInNewTab) {
		state.addTab({ panes: [newDiffPane] });
		return;
	}
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "diff") continue;
			const prev = pane.data as DiffPaneData;
			state.setPaneData({
				paneId: pane.id,
				data: {
					...prev,
					path: filePath,
					changeKey,
					// Only the navigated file's key can be pruned; without a
					// change key we can't identify it, so leave the set intact.
					collapsedFiles: changeKey
						? (prev.collapsedFiles ?? []).filter((key) => key !== changeKey)
						: (prev.collapsedFiles ?? []),
					...focusFields,
				} as PaneViewerData,
			});
			state.focusPane(pane.id);
			return;
		}
	}
	if (target === "tab") {
		state.addTab({ panes: [newDiffPane] });
		return;
	}
	state.openPane({ pane: newDiffPane });
}
