import type { TabsState } from "./schemas";

/**
 * Keeps only tabs of workspaces that still exist, and the panes, focus,
 * active-tab and history entries that belong to them. Returns the same object
 * when nothing is stale, so callers can skip a write.
 */
export function pruneTabsState(
	state: TabsState,
	liveWorkspaceIds: ReadonlySet<string>,
): TabsState {
	const tabs = state.tabs.filter((tab) =>
		liveWorkspaceIds.has(tab.workspaceId),
	);
	const tabIds = new Set(tabs.map((tab) => tab.id));
	const panes = Object.fromEntries(
		Object.entries(state.panes).filter(([, pane]) => tabIds.has(pane.tabId)),
	);
	const activeTabIds = Object.fromEntries(
		Object.entries(state.activeTabIds).filter(
			([workspaceId, tabId]) =>
				liveWorkspaceIds.has(workspaceId) &&
				(tabId === null || tabIds.has(tabId)),
		),
	);
	const focusedPaneIds = Object.fromEntries(
		Object.entries(state.focusedPaneIds).filter(
			([tabId, paneId]) => tabIds.has(tabId) && paneId in panes,
		),
	);
	const tabHistoryStacks = Object.fromEntries(
		Object.entries(state.tabHistoryStacks)
			.filter(([workspaceId]) => liveWorkspaceIds.has(workspaceId))
			.map(([workspaceId, stack]) => [
				workspaceId,
				stack.filter((tabId) => tabIds.has(tabId)),
			]),
	);

	const unchanged =
		tabs.length === state.tabs.length &&
		Object.keys(panes).length === Object.keys(state.panes).length &&
		Object.keys(activeTabIds).length ===
			Object.keys(state.activeTabIds).length &&
		Object.keys(focusedPaneIds).length ===
			Object.keys(state.focusedPaneIds).length &&
		Object.entries(tabHistoryStacks).every(
			([workspaceId, stack]) =>
				stack.length === state.tabHistoryStacks[workspaceId]?.length,
		) &&
		Object.keys(tabHistoryStacks).length ===
			Object.keys(state.tabHistoryStacks).length;
	if (unchanged) return state;

	return {
		...state,
		tabs,
		panes,
		activeTabIds,
		focusedPaneIds,
		tabHistoryStacks,
	};
}
