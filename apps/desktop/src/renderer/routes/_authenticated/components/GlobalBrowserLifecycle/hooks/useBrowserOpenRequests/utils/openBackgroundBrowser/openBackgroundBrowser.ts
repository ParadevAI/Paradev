import { createWorkspaceStore } from "@superset/panes";
import { placeInTabs } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/utils/placeInTabs";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { getPaneKey } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/getPaneKey";
import {
	openUrlInV2Workspace,
	type V2WorkspaceUrlOpenTarget,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openUrlInV2Workspace";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { updateWorkspaceView } from "renderer/routes/_authenticated/providers/CollectionsProvider/workspaceViews";
import {
	getAreaLayout,
	withAreaLayout,
	withRightPaneVisibility,
} from "shared/workspace-views";

/** Opens the browser as the active right pane tab and opens the right pane. */
export function openBackgroundBrowser({
	collections,
	workspaceId,
	url,
	target,
	createPaneId = () => `pane-${crypto.randomUUID()}`,
}: {
	collections: Pick<
		AppCollections,
		"v2WorkspaceViews" | "v2WorkspaceLocalState"
	>;
	workspaceId: string;
	url: string;
	target: V2WorkspaceUrlOpenTarget;
	createPaneId?: () => string;
}): string {
	const paneId = createPaneId();
	updateWorkspaceView(collections, workspaceId, (view) => {
		const store = createWorkspaceStore<PaneViewerData>({
			initialState: getAreaLayout(view, "sidebar"),
			getPaneKey,
			placePane: placeInTabs,
		});
		openUrlInV2Workspace({ store, url, target, paneId, focus: false });
		if (!store.getState().getPane(paneId)) {
			throw new Error("Browser open did not create a pane");
		}
		const { version, tabs, activeTabId } = store.getState();
		return withRightPaneVisibility(
			withAreaLayout(view, "sidebar", { version, tabs, activeTabId }),
			{ open: true },
		);
	});
	return paneId;
}
