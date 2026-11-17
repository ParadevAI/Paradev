import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import {
	useUserPreferences,
	type UserPreferencesApi,
} from "renderer/hooks/useUserPreferences";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/workspace/providers/WorkspaceProvider";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useRightPaneAreaEnabled } from "renderer/stores/right-pane-area";

export function useWorkspaceRightSidebarOpen(): {
	isOpen: boolean;
	setOpen: UserPreferencesApi["setRightSidebarOpen"];
} {
	const collections = useCollections();
	const { workspace } = useWorkspace();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const { preferences, setRightSidebarOpen } = useUserPreferences();
	const isPerWorkspace = useRightPaneAreaEnabled() === true;
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ workspaceLocalState: collections.workspaceLocalState })
				.where(({ workspaceLocalState }) =>
					eq(workspaceLocalState.workspaceId, workspace.id),
				),
		[collections, workspace.id],
	);
	const workspaceOpen =
		rows.find((row) => row.workspaceId === workspace.id)?.rightSidebarOpen ??
		false;

	const setWorkspaceOpen = useCallback<
		UserPreferencesApi["setRightSidebarOpen"]
	>(
		(next) => {
			if (!collections.workspaceLocalState.has(workspace.id)) {
				ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
			}
			collections.workspaceLocalState.update(workspace.id, (draft) => {
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
