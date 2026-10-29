import type { WorkspaceStore } from "@superset/panes";
import {
	isSamePullRequest,
	type PullRequestRef,
} from "renderer/lib/github/pullRequestRef";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, PullRequestPaneData } from "../../types";
import { PULL_REQUEST_PANE_KEY } from "../getPaneKey";

/**
 * Focus the workspace's pull-request pane, retargeting it to `ref` when one
 * already exists (a workspace links one PR, so one pane is enough), or
 * opening a fresh one beside the active pane — from the Changes pane that
 * lands the PR summary next to the diff.
 */
export function openPullRequestPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	ref: PullRequestRef,
	placement: "split" | "tab" = "split",
): void {
	const data: PullRequestPaneData = {
		repoFullName: ref.repoFullName,
		number: ref.number,
	};
	const state = store.getState();
	const open = state.findPaneByKey(PULL_REQUEST_PANE_KEY);
	const replaceData =
		open !== null &&
		!isSamePullRequest(open.pane.data as PullRequestPaneData, data);
	const pane = { kind: "pull-request", data: data as PaneViewerData };
	if (placement === "tab") state.addTab({ panes: [pane], replaceData });
	else state.openPane({ pane, replaceData });
}
