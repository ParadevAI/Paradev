import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Every host this client can reach, plus the cloud. */
export const WHERE_FILTER_ANYWHERE = "anywhere";
export const WHERE_FILTER_THIS_DEVICE = "this-device";
export const WHERE_FILTER_CLOUD = "cloud";
/** Sentinel for project-less "session" workspaces in the project filter. */
export const PROJECT_FILTER_SESSIONS = "__sessions__";

/** One of the WHERE_FILTER_* sentinels, or a device's machine id. */
export type V2WorkspacesWhereFilter = string;
export type V2WorkspacesProjectFilter = string;

export type V2WorkspacesViewMode = "list" | "board";

interface V2WorkspacesFilterState {
	searchQuery: string;
	whereFilter: V2WorkspacesWhereFilter;
	/** Empty = all projects. May contain PROJECT_FILTER_SESSIONS. */
	projectFilters: string[];
	/** Creator user ids; empty = any creator. */
	creatorFilters: string[];
	/** Archived tombstones render in their own last sections (both views). */
	showArchived: boolean;
	viewMode: V2WorkspacesViewMode;
	setSearchQuery: (searchQuery: string) => void;
	setWhereFilter: (whereFilter: V2WorkspacesWhereFilter) => void;
	setProjectFilters: (projectFilters: string[]) => void;
	setCreatorFilters: (creatorFilters: string[]) => void;
	setShowArchived: (showArchived: boolean) => void;
	setViewMode: (viewMode: V2WorkspacesViewMode) => void;
	/** Clears filters (incl. archived) — view mode persists. */
	reset: () => void;
}

export const useV2WorkspacesFilterStore = create<V2WorkspacesFilterState>()(
	persist(
		(set) => ({
			searchQuery: "",
			whereFilter: WHERE_FILTER_ANYWHERE,
			projectFilters: [],
			creatorFilters: [],
			showArchived: false,
			viewMode: "list",
			setSearchQuery: (searchQuery) => set({ searchQuery }),
			setWhereFilter: (whereFilter) => set({ whereFilter }),
			setProjectFilters: (projectFilters) => set({ projectFilters }),
			setCreatorFilters: (creatorFilters) => set({ creatorFilters }),
			setShowArchived: (showArchived) => set({ showArchived }),
			setViewMode: (viewMode) => set({ viewMode }),
			reset: () =>
				set({
					searchQuery: "",
					whereFilter: WHERE_FILTER_ANYWHERE,
					projectFilters: [],
					creatorFilters: [],
					showArchived: false,
				}),
		}),
		{
			name: "v2-workspaces-view",
			// Fixed-size singleton: only the list/board choice survives reloads.
			// Filters and search stay per-visit (a `?view=` deep link still wins
			// — the page hydrates URL params over the rehydrated value on mount).
			partialize: (state) => ({ viewMode: state.viewMode }),
		},
	),
);
