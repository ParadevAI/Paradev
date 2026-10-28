import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import {
	useV2UserPreferences,
	type V2UserPreferencesApi,
} from "renderer/hooks/useV2UserPreferences";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useRightPaneAreaEnabled } from "renderer/stores/right-pane-area";

export function useWorkspaceRightSidebarOpen(): {
	isOpen: boolean;
	setOpen: V2UserPreferencesApi["setRightSidebarOpen"];
} {
	const collections = useCollections();
	const { workspace } = useWorkspace();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const { preferences, setRightSidebarOpen } = useV2UserPreferences();
	const isPerWorkspace = useRightPaneAreaEnabled() === true;
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspace.id),
				),
		[collections, workspace.id],
	);
	const workspaceOpen =
		rows.find((row) => row.workspaceId === workspace.id)?.rightSidebarOpen ??
		false;

	const setWorkspaceOpen = useCallback<
		V2UserPreferencesApi["setRightSidebarOpen"]
	>(
		(next) => {
			if (!collections.v2WorkspaceLocalState.has(workspace.id)) {
				ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
			}
			collections.v2WorkspaceLocalState.update(workspace.id, (draft) => {
				const prev = draft.rightSidebarOpen ?? false;
				draft.rightSidebarOpen = typeof next === "function" ? next(prev) : next;
			});
		},
		[collections, workspace.id, workspace.projectId, ensureWorkspaceInSidebar],
	);

	return isPerWorkspace
		? { isOpen: workspaceOpen, setOpen: setWorkspaceOpen }
		: { isOpen: preferences.rightSidebarOpen, setOpen: setRightSidebarOpen };
}
