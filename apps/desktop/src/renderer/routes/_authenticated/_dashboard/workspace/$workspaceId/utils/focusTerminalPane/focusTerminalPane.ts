import type { WorkspaceState, WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../types";

interface TerminalPaneLocation {
	tabId: string;
	paneId: string;
}

export type FocusOrAddTerminalPaneResult = "focused" | "added";

export function findTerminalPaneLocation(
	state: WorkspaceState<PaneViewerData>,
	terminalId: string,
): TerminalPaneLocation | null {
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "terminal" && pane.kind !== "chat-v3") continue;
			const data = pane.data as Partial<TerminalPaneData>;
			if (data.terminalId !== terminalId) continue;
			return { tabId: tab.id, paneId: pane.id };
		}
	}

	return null;
}

export function focusTerminalPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	terminalId: string,
	{ focus = true }: { focus?: boolean } = {},
): boolean {
	const state = store.getState();
	const location = findTerminalPaneLocation(state, terminalId);
	if (!location) return false;

	if (focus) state.focusPane(location.paneId);
	else state.setActivePane(location);
	return true;
}

export function focusOrAddTerminalPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	terminalId: string,
	{ focus = true }: { focus?: boolean } = {},
): FocusOrAddTerminalPaneResult {
	if (focusTerminalPane(store, terminalId, { focus })) return "focused";

	store.getState().addTab({
		focus,
		panes: [
			{
				kind: "terminal",
				data: { terminalId } as PaneViewerData,
			},
		],
	});
	return "added";
}
