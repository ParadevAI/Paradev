import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import {
	findTerminalPaneLocation,
	focusOrAddTerminalPane,
} from "../focusTerminalPane";

/**
 * Give each terminal a tab, oldest first, without moving the selection off a
 * tab the user already has. In an empty layout the oldest terminal is
 * selected: the host starts an independent agent before the setup terminal.
 */
export function adoptTerminalPanes(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	oldestFirstTerminalIds: readonly string[],
): void {
	const [firstTerminalId] = oldestFirstTerminalIds;
	if (firstTerminalId === undefined) return;

	const previousActiveTabId = store.getState().activeTabId;
	for (const terminalId of oldestFirstTerminalIds) {
		focusOrAddTerminalPane(store, terminalId, { focus: false });
	}

	const state = store.getState();
	const selectedTabId =
		previousActiveTabId ??
		findTerminalPaneLocation(state, firstTerminalId)?.tabId;
	if (selectedTabId) state.setActiveTab(selectedTabId);
}
