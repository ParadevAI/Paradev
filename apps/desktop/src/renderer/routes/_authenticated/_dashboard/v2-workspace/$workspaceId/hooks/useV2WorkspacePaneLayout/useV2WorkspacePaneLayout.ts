import {
	connectWorkspaceStore,
	createWorkspaceStore,
	type WorkspaceState,
} from "@superset/panes";
import type { PaneArea } from "@superset/shared/pane-layout-ops";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { ensureWorkspaceView } from "renderer/routes/_authenticated/providers/CollectionsProvider/workspaceViews";
import { getAreaLayout } from "shared/workspace-views";
import type { PaneViewerData } from "../../types";
import { getPaneKey } from "../../utils/getPaneKey";
import { placeInTabs } from "./utils/placeInTabs";
import { viewAreaSource } from "./utils/viewAreaSource";

export type PaneLayoutSlot = "paneLayout" | "rightPaneLayout";

const AREA: Record<PaneLayoutSlot, PaneArea> = {
	paneLayout: "main",
	rightPaneLayout: "sidebar",
};

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

export function useV2WorkspacePaneLayout({
	slot = "paneLayout",
}: {
	slot?: PaneLayoutSlot;
} = {}) {
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const collections = useCollections();
	const area = AREA[slot];
	// One store per workspace, seeded from its view: a store shared across a
	// fast switch can render and save one worktree's panes under another, and
	// an empty seed blanks the tab bar for a paint after every switch.
	const store = useMemo(() => {
		const view = collections.v2WorkspaceViews.get(workspaceId);
		return createWorkspaceStore<PaneViewerData>({
			initialState: view ? getAreaLayout(view, area) : EMPTY_STATE,
			getPaneKey,
			...(slot === "rightPaneLayout" ? { placePane: placeInTabs } : {}),
		});
	}, [collections, workspaceId, slot, area]);

	const { data: views = [], isReady: isLayoutReady } = useLiveQuery(
		(query) =>
			query
				.from({ view: collections.v2WorkspaceViews })
				.where(({ view }) => eq(view.workspaceId, workspaceId)),
		[collections, workspaceId],
	);

	useEffect(() => {
		if (!isLayoutReady) return;
		ensureWorkspaceView(collections, workspaceId);
		return connectWorkspaceStore(
			store,
			viewAreaSource(collections, workspaceId, area),
		);
	}, [collections, store, workspaceId, area, isLayoutReady]);

	return {
		store,
		isLayoutReady,
		hasRow: views.some((view) => view.workspaceId === workspaceId),
	};
}
