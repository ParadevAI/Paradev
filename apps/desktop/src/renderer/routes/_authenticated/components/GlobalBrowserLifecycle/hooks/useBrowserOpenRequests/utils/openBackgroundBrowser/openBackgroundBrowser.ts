import type { WorkspaceState } from "@superset/panes";
import { createPaneLayoutStore } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/utils/createPaneLayoutStore";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
	openUrlInV2Workspace,
	type V2WorkspaceUrlOpenTarget,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openUrlInV2Workspace";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { getV2PaneLayoutStore } from "renderer/stores/v2-pane-layout-stores";
import {
	applyRememberedV2PaneSelection,
	rememberV2PaneSelection,
} from "renderer/stores/v2-pane-selection";

const EMPTY_LAYOUT: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

/**
 * Opens the browser as the active right pane tab and opens the right pane, in
 * the live store when the workspace is mounted in this window, else in its row.
 */
export function openBackgroundBrowser({
	collections,
	workspaceId,
	url,
	target,
	createPaneId = () => `pane-${crypto.randomUUID()}`,
}: {
	collections: Pick<AppCollections, "v2WorkspaceLocalState">;
	workspaceId: string;
	url: string;
	target: V2WorkspaceUrlOpenTarget;
	createPaneId?: () => string;
}): string {
	const row = collections.v2WorkspaceLocalState.get(workspaceId);
	if (!row)
		throw new Error(`Workspace ${workspaceId} has no local pane layout`);
	const paneId = createPaneId();
	const selectionKey = `${workspaceId}:rightPaneLayout`;
	const mounted = getV2PaneLayoutStore(workspaceId, "rightPaneLayout");
	const store =
		mounted ??
		createPaneLayoutStore(
			"rightPaneLayout",
			applyRememberedV2PaneSelection(
				selectionKey,
				(row.rightPaneLayout as WorkspaceState<PaneViewerData> | undefined) ??
					EMPTY_LAYOUT,
			),
		);
	openUrlInV2Workspace({ store, url, target, paneId, focus: false });
	if (!store.getState().getPane(paneId))
		throw new Error("Browser open did not create a pane");

	if (mounted) {
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.rightSidebarOpen = true;
		});
		return paneId;
	}

	const { version, tabs, activeTabId } = store.getState();
	const rightPaneLayout = { version, tabs, activeTabId };
	collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
		draft.rightPaneLayout = rightPaneLayout;
		draft.rightSidebarOpen = true;
	});
	rememberV2PaneSelection(selectionKey, rightPaneLayout);
	return paneId;
}
