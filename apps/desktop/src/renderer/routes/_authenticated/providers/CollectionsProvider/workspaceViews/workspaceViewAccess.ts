import type { WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { emptyWorkspaceView, type WorkspaceView } from "shared/workspace-views";
import type { WorkspaceLocalStateRow } from "../dashboardSidebarLocal";
import type { WorkspaceViewsCollection } from "./workspaceViews";

interface ViewCollections {
	v2WorkspaceViews: WorkspaceViewsCollection;
	v2WorkspaceLocalState: {
		get(workspaceId: string): WorkspaceLocalStateRow | undefined;
	};
}

type LegacyRow = Pick<
	WorkspaceLocalStateRow,
	"workspaceId" | "paneLayout" | "rightPaneLayout" | "rightSidebarOpen"
>;

/** The view a workspace had before views moved to main, from its localStorage row. */
export function viewFromLegacyRow(row: LegacyRow): WorkspaceView {
	const main = row.paneLayout as WorkspaceState<PaneViewerData>;
	const right = row.rightPaneLayout as
		| WorkspaceState<PaneViewerData>
		| undefined;
	return {
		workspaceId: row.workspaceId,
		version: 1,
		mainArea: { tabs: main.tabs, activeTabId: main.activeTabId },
		rightPane: {
			tabs: right?.tabs ?? [],
			activeTabId: right?.activeTabId ?? null,
			visibility: row.rightSidebarOpen ? "open" : "closed",
		},
	};
}

/**
 * The workspace's view, created from its old localStorage layout the first
 * time it is needed. Call only once the views collection has loaded from
 * main, or a new view would overwrite the one main already has.
 */
export function ensureWorkspaceView(
	collections: ViewCollections,
	workspaceId: string,
): WorkspaceView {
	const existing = collections.v2WorkspaceViews.get(workspaceId);
	if (existing) return existing;
	if (!collections.v2WorkspaceViews.isReady()) {
		throw new Error("Workspace views have not loaded from the desktop yet");
	}
	const legacy = collections.v2WorkspaceLocalState.get(workspaceId);
	const view = legacy
		? viewFromLegacyRow(legacy)
		: emptyWorkspaceView(workspaceId);
	collections.v2WorkspaceViews.insert(view);
	return view;
}

export function updateWorkspaceView(
	collections: ViewCollections,
	workspaceId: string,
	change: (view: WorkspaceView) => WorkspaceView,
): void {
	const next = change(ensureWorkspaceView(collections, workspaceId));
	collections.v2WorkspaceViews.update(workspaceId, (draft) => {
		draft.mainArea = next.mainArea;
		draft.rightPane = next.rightPane;
	});
}

/** Runs `change` now, or once the views have loaded from main. */
export function updateWorkspaceViewWhenReady(
	collections: ViewCollections,
	workspaceId: string,
	change: (view: WorkspaceView) => WorkspaceView,
): Promise<void> {
	if (collections.v2WorkspaceViews.isReady()) {
		updateWorkspaceView(collections, workspaceId, change);
		return Promise.resolve();
	}
	return collections.v2WorkspaceViews
		.stateWhenReady()
		.then(() => updateWorkspaceView(collections, workspaceId, change));
}
