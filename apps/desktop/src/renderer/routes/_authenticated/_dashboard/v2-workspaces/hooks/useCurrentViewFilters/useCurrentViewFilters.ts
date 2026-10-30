import { useMemo } from "react";
import {
	useV2WorkspacesFilterStore,
	type V2WorkspacesViewFilters,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";

/** Filters currently applied, as a view would store them. Selected field by
 * field: a selector that built the object would hand zustand a new snapshot
 * every call and re-render forever. */
export function useCurrentViewFilters(): V2WorkspacesViewFilters {
	const whereFilter = useV2WorkspacesFilterStore((state) => state.whereFilter);
	const projectFilters = useV2WorkspacesFilterStore(
		(state) => state.projectFilters,
	);
	const creatorFilters = useV2WorkspacesFilterStore(
		(state) => state.creatorFilters,
	);
	const statusFilters = useV2WorkspacesFilterStore(
		(state) => state.statusFilters,
	);
	const showArchived = useV2WorkspacesFilterStore(
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
