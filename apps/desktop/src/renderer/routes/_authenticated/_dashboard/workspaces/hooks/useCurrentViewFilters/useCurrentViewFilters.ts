import { useMemo } from "react";
import {
	useWorkspacesFilterStore,
	type V2WorkspacesViewFilters,
} from "renderer/routes/_authenticated/_dashboard/workspaces/stores/workspacesFilterStore";

/** Filters currently applied, as a view would store them. Selected field by
 * field: a selector that built the object would hand zustand a new snapshot
 * every call and re-render forever. */
export function useCurrentViewFilters(): V2WorkspacesViewFilters {
	const whereFilter = useWorkspacesFilterStore((state) => state.whereFilter);
	const projectFilters = useWorkspacesFilterStore(
		(state) => state.projectFilters,
	);
	const creatorFilters = useWorkspacesFilterStore(
		(state) => state.creatorFilters,
	);
	const statusFilters = useWorkspacesFilterStore(
		(state) => state.statusFilters,
	);
	const showArchived = useWorkspacesFilterStore(
		(state) => state.showArchived,
	);
	return useMemo(
		() => ({
			whereFilter,
			projectFilters,
			creatorFilters,
			statusFilters,
			showArchived,
		}),
		[whereFilter, projectFilters, creatorFilters, statusFilters, showArchived],
	);
}
