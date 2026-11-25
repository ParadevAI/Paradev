import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/workspace/providers/WorkspaceProvider";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export function useActivityPanelVisibility(workspaceId: string) {
	const collections = useCollections();
	const { workspace } = useWorkspace();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ localState: collections.workspaceLocalState })
				.where(({ localState }) => eq(localState.workspaceId, workspaceId))
				.select(({ localState }) => ({
					workspaceId: localState.workspaceId,
					hidden: localState.activityPanelHidden,
				})),
		[collections, workspaceId],
	);
	const hidden =
		rows.find((row) => row.workspaceId === workspaceId)?.hidden ??
		collections.workspaceLocalState.get(workspaceId)?.activityPanelHidden ??
		false;
	const setHidden = useCallback(
		(next: boolean) => {
			if (!collections.workspaceLocalState.has(workspaceId)) {
				ensureWorkspaceInSidebar(workspaceId, workspace.projectId);
			}
			collections.workspaceLocalState.update(workspaceId, (draft) => {
				draft.activityPanelHidden = next;
			});
		},
		[collections, workspaceId, workspace.projectId, ensureWorkspaceInSidebar],
	);
	return { hidden, setHidden };
}
