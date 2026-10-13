import type { WorkspaceStore } from "@superset/panes";
import {
	isSamePullRequest,
	type PullRequestRef,
} from "renderer/lib/github/pullRequestRef";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, PullRequestPaneData } from "../../types";

/**
 * Focus the workspace's pull-request pane, retargeting it to `ref` when one
 * already exists (a workspace links one PR, so one pane is enough), or
 * opening a fresh one beside the active pane — from the Changes pane that
 * lands the PR summary next to the diff.
 */
export function openPullRequestPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	ref: PullRequestRef,
): void {
	const state = store.getState();
	const data: PullRequestPaneData = {
		repoFullName: ref.repoFullName,
		number: ref.number,
	};

	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "pull-request") continue;
			if (!isSamePullRequest(pane.data as PullRequestPaneData, data)) {
				state.setPaneData({ paneId: pane.id, data: data as PaneViewerData });
			}
			state.setActiveTab(tab.id);
			state.setActivePane({ tabId: tab.id, paneId: pane.id });
			return;
		}
	}

	state.openPane({
		pane: { kind: "pull-request", data: data as PaneViewerData },
	});
}

/** The PR the active tab's pull-request pane shows, if that tab has one. */
export function findVisiblePullRequestNumber(
	state: WorkspaceStore<PaneViewerData>,
): number | null {
	const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
	const pane = activeTab
		? Object.values(activeTab.panes).find((p) => p.kind === "pull-request")
		: undefined;
	return pane ? (pane.data as PullRequestPaneData).number : null;
}
