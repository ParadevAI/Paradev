import type { OpenPaneArgs, WorkspaceStore } from "@superset/panes";

export function placeInTabs<TData>(
	store: WorkspaceStore<TData>,
	{ pane, focus, reuse }: OpenPaneArgs<TData>,
): void {
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
