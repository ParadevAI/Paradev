import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { preserveLocalPaneSelection } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useWorkspacePaneLayout/utils/preserveLocalPaneSelection";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import { openUrlInWorkspace } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/utils/openUrlInWorkspace";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { applyRememberedPaneSelection } from "renderer/stores/pane-selection";

const EMPTY_LAYOUT: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

export function openBackgroundBrowser({
	collections,
	workspaceId,
	url,
}: {
	collections: Pick<AppCollections, "workspaceLocalState">;
	workspaceId: string;
	url: string;
}): string {
	const row = collections.workspaceLocalState.get(workspaceId);
	if (!row)
		throw new Error(`Workspace ${workspaceId} has no local pane layout`);
	const previous = applyRememberedPaneSelection(
		`${workspaceId}:rightPaneLayout`,
		(row.rightPaneLayout ?? EMPTY_LAYOUT) as WorkspaceState<PaneViewerData>,
	);
	const store = createWorkspaceStore<PaneViewerData>({
		initialState: previous,
	});
	const paneId = openUrlInWorkspace({ store, url, target: "new-tab" });
	if (!paneId) throw new Error("Browser open did not create a pane");
	const next = store.getState();
	const paneLayout = preserveLocalPaneSelection(previous, {
		version: next.version,
		tabs: next.tabs,
		activeTabId: next.activeTabId,
	});
	collections.workspaceLocalState.update(workspaceId, (draft) => {
		draft.rightPaneLayout = paneLayout;
	});
	return paneId;
}
