import type { WorkspaceStore } from "@superset/panes";
import type { ChangesOpenTarget } from "renderer/stores/settings";
import type { StoreApi } from "zustand/vanilla";
import type { DiffPaneData, PaneViewerData } from "../../types";

export const NEW_DIFF_PANE = {
	kind: "diff",
	data: { path: "", collapsedFiles: [] } as DiffPaneData,
} as const;

/**
 * Focus the workspace's Changes pane, creating one when none exists.
 *
 * `target` is the user's changesOpenTarget setting:
 * - "pane" focuses the active tab's diff pane, or places a new one the way
 *   the store places panes (a split in the center, a tab on the right).
 * - "tab" converges on the first `diff` pane in tab order — the same pane
 *   every other diff navigation targets (see openDiffPane) — adding a
 *   dedicated tab when none exists.
 */
export function openChangesPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	target: ChangesOpenTarget = "pane",
): void {
	const state = store.getState();

	if (target === "pane") {
		const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
		const existing =
			activeTab &&
			Object.values(activeTab.panes).find((pane) => pane.kind === "diff");
		if (activeTab && existing) {
			state.focusPane(existing.id);
			return;
		}
		state.openPane({ pane: NEW_DIFF_PANE });
		return;
	}

	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "diff") continue;
			state.focusPane(pane.id);
			return;
		}
	}
	state.addTab({ panes: [NEW_DIFF_PANE] });
}

/** The Changes pane the user can currently see: the active tab's diff pane. */
export function findVisibleChangesPane(
	state: WorkspaceStore<PaneViewerData>,
): { tabId: string; paneId: string } | null {
	const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
	if (!activeTab) return null;
	// The focused pane wins when the tab holds several diff panes (a diff
	// tab dragged into a split), so a toggle closes the one being looked at.
	const focused = activeTab.activePaneId
		? activeTab.panes[activeTab.activePaneId]
		: undefined;
	const pane =
		focused?.kind === "diff"
			? focused
			: Object.values(activeTab.panes).find((p) => p.kind === "diff");
	return pane ? { tabId: activeTab.id, paneId: pane.id } : null;
}

/**
 * Close the visible Changes pane — the tab goes with it when the pane was
 * its only one (closePane drops emptied tabs). Returns whether anything
 * closed, so a toggle can fall through to opening.
 */
export function closeVisibleChangesPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
): boolean {
	const state = store.getState();
	const visible = findVisibleChangesPane(state);
	if (!visible) return false;
	state.closePane(visible);
	return true;
}
