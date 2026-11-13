import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import {
	useWorkspaceCheckouts,
	useWorkspaceLocalStateRow,
} from "../activeRepositoryStore";

const ALL: ChangesFilter = { kind: "all" };

/**
 * The Changes commit filter. A workspace of several checkouts keeps one
 * filter per repository; a single checkout keeps the sidebar's own filter.
 */
export function useChangesFilter(
	workspaceId: string,
	repositoryId: string | undefined,
): ChangesFilter {
	const row = useWorkspaceLocalStateRow(workspaceId);
	const perRepository = useWorkspaceCheckouts(workspaceId).length > 1;
	if (perRepository && repositoryId) {
		return row?.repositoryChangesFilters?.[repositoryId] ?? ALL;
	}
	return row?.sidebarState?.changesFilter ?? ALL;
}

export function useSetChangesFilter(
	workspaceId: string,
	repositoryId: string | undefined,
): (next: ChangesFilter) => void {
	const collections = useCollections();
	const perRepository = useWorkspaceCheckouts(workspaceId).length > 1;
	return useCallback(
		(next: ChangesFilter) => {
			const state = collections.v2WorkspaceLocalState;
			if (!state.get(workspaceId)) return;
			state.update(workspaceId, (draft) => {
				if (perRepository && repositoryId) {
					draft.repositoryChangesFilters = {
						...draft.repositoryChangesFilters,
						[repositoryId]: next,
					};
					return;
				}
				draft.sidebarState.changesFilter = next;
			});
		},
		[collections, workspaceId, repositoryId, perRepository],
	);
}
