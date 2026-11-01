import type { WorkspaceState, WorkspaceStateSource } from "@superset/panes";
import type { PaneArea } from "@superset/shared/pane-layout-ops";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { updateWorkspaceView } from "renderer/routes/_authenticated/providers/CollectionsProvider/workspaceViews";
import { getAreaLayout, withAreaLayout } from "shared/workspace-views";
import type { PaneViewerData } from "../../../../types";

const EMPTY_LAYOUT: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

/** One area of a workspace's view, as the source a pane store mirrors. */
export function viewAreaSource(
	collections: Pick<
		AppCollections,
		"v2WorkspaceViews" | "v2WorkspaceLocalState"
	>,
	workspaceId: string,
	area: PaneArea,
): WorkspaceStateSource<PaneViewerData> {
	return {
		get: () => {
			const view = collections.v2WorkspaceViews.get(workspaceId);
			return view ? getAreaLayout(view, area) : EMPTY_LAYOUT;
		},
		set: (layout) =>
			updateWorkspaceView(collections, workspaceId, (view) =>
				withAreaLayout(view, area, layout),
			),
		subscribe: (onChange) => {
			const subscription = collections.v2WorkspaceViews.subscribeChanges(
				(changes) => {
					if (changes.some((change) => change.key === workspaceId)) onChange();
				},
			);
			return () => subscription.unsubscribe();
		},
	};
}
