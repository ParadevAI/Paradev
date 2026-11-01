import type { OpenPaneArgs, WorkspaceStore } from "@superset/panes";

export function placeInTabs<TData>(
	store: WorkspaceStore<TData>,
	{ pane, beside, focus, reuse }: OpenPaneArgs<TData>,
): void {
	const anchor = beside ? store.getPane(beside) : null;
	const anchorTab = anchor ? store.getTab(anchor.tabId) : null;
	if (anchor && anchorTab) {
		const reusable = Object.values(anchorTab.panes).find(
			(candidate) =>
				candidate.kind === pane.kind &&
				!candidate.pinned &&
				candidate.id !== anchor.pane.id,
		);
		if (reusable) {
			store.setPaneData({ paneId: reusable.id, data: pane.data });
			store.setActivePane({ tabId: anchorTab.id, paneId: reusable.id });
			return;
		}
		// Panes are at least 260px wide, so a side-by-side split pushes a narrow anchor off screen.
		store.splitPane({
			tabId: anchorTab.id,
			paneId: anchor.pane.id,
			position: "top",
			newPane: pane,
			focus: false,
		});
		return;
	}

	const tabs = [
		...store.tabs.filter((tab) => tab.id === store.activeTabId),
		...store.tabs.filter((tab) => tab.id !== store.activeTabId),
	];
	for (const tab of tabs) {
		const reusable = Object.values(tab.panes).find(
			(candidate) => candidate.kind === pane.kind && !candidate.pinned,
		);
		if (!reusable) continue;
		store.replacePane({ tabId: tab.id, paneId: reusable.id, newPane: pane });
		store.setActiveTab(tab.id);
		return;
	}
	store.addTab({ panes: [pane], focus, reuse });
}
