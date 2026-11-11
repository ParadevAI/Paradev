import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { create } from "zustand";

const ALL: ChangesFilter = { kind: "all" };

interface RepositoryChangesFilterState {
	byWorkspace: Record<string, ChangesFilter>;
	set: (workspaceId: string, filter: ChangesFilter) => void;
}

// ponytail: in-memory only. A repository checkout of a multi-repo workspace has
// no local state row, so its commit filter lives here and resets on reload.
const useRepositoryChangesFilterStore = create<RepositoryChangesFilterState>()(
	(set) => ({
		byWorkspace: {},
		set: (workspaceId, filter) =>
			set((state) => ({
				byWorkspace: { ...state.byWorkspace, [workspaceId]: filter },
			})),
	}),
);

/** The Changes commit filter: the workspace's local row, else the in-memory store. */
export function useChangesFilter(workspaceId: string): ChangesFilter {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const stored = useRepositoryChangesFilterStore(
		(state) => state.byWorkspace[workspaceId],
	);
	const row = rows[0];
	if (row) return row.sidebarState?.changesFilter ?? ALL;
	return stored ?? ALL;
}

export function useSetChangesFilter(
	workspaceId: string,
): (next: ChangesFilter) => void {
	const collections = useCollections();
	const setStored = useRepositoryChangesFilterStore((state) => state.set);
	return useCallback(
		(next: ChangesFilter) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
				setStored(workspaceId, next);
				return;
			}
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.changesFilter = next;
			});
		},
		[collections, workspaceId, setStored],
	);
}
