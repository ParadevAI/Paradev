import type { WorkspaceStore } from "@superset/panes";
import type { ChangesOpenTarget } from "renderer/stores/settings";
import type { StoreApi } from "zustand/vanilla";
import type { DiffPaneData, PaneViewerData } from "../../types";

const NEW_DIFF_PANE = {
	kind: "diff",
	data: { path: "", collapsedFiles: [] } as DiffPaneData,
} as const;

/**
 * Focus the workspace's Changes pane, creating one when none exists.
 *
 * `target` is the user's changesOpenTarget setting:
 * - "pane" splits the active tab (or focuses that tab's existing diff pane),
 *   keeping the user in their current context.
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
		if (activeTab) {
			const existing = Object.values(activeTab.panes).find(
				(pane) => pane.kind === "diff",
			);
			if (existing) {
				state.setActivePane({ tabId: activeTab.id, paneId: existing.id });
				return;
			}
			state.addPane({ tabId: activeTab.id, pane: NEW_DIFF_PANE });
			return;
		}
		// No tabs yet (empty workspace) — fall through to creating one.
	} else {
		for (const tab of state.tabs) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind !== "diff") continue;
				state.setActiveTab(tab.id);
				state.setActivePane({ tabId: tab.id, paneId: pane.id });
				return;
			}
		}
	}

	state.addTab({ panes: [NEW_DIFF_PANE] });
}
