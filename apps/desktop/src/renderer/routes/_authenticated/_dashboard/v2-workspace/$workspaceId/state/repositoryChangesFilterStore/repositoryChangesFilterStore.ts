import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { useWorkspace } from "../../../providers/WorkspaceProvider";
import { useWorkspaceLocalStateRow } from "../activeRepositoryStore";

const ALL: ChangesFilter = { kind: "all" };

/**
 * The Changes commit filter. A checkout of a multi-repo workspace has no
 * local state row, so its filter is kept on the container's row.
 */
export function useChangesFilter(workspaceId: string): ChangesFilter {
	const containerId = useWorkspace().workspace.id;
	const row = useWorkspaceLocalStateRow(workspaceId);
	const container = useWorkspaceLocalStateRow(containerId);
	if (row) return row.sidebarState?.changesFilter ?? ALL;
	return container?.repositoryChangesFilters?.[workspaceId] ?? ALL;
}

export function useSetChangesFilter(
	workspaceId: string,
): (next: ChangesFilter) => void {
	const collections = useCollections();
	const containerId = useWorkspace().workspace.id;
	return useCallback(
		(next: ChangesFilter) => {
			const state = collections.v2WorkspaceLocalState;
			if (state.get(workspaceId)) {
				state.update(workspaceId, (draft) => {
					draft.sidebarState.changesFilter = next;
				});
				return;
			}
			if (!state.get(containerId)) return;
			state.update(containerId, (draft) => {
				draft.repositoryChangesFilters = {
					...draft.repositoryChangesFilters,
					[workspaceId]: next,
				};
			});
		},
		[collections, workspaceId, containerId],
	);
}
