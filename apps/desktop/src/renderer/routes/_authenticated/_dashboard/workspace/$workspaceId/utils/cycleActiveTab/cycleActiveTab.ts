import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";

export function cycleActiveTab<TData>(
	store: StoreApi<WorkspaceStore<TData>>,
	step: 1 | -1,
	{ focus = false }: { focus?: boolean } = {},
): void {
	const state = store.getState();
	const count = state.tabs.length;
	if (!state.activeTabId || count === 0) return;
	const index = state.tabs.findIndex((t) => t.id === state.activeTabId);
	const from = index === -1 ? (step > 0 ? count - 1 : 0) : index;
	const tab = state.tabs[(from + step + count) % count];
	if (!tab) return;
	if (focus && tab.activePaneId) state.focusPane(tab.activePaneId);
	else state.setActiveTab(tab.id);
}
