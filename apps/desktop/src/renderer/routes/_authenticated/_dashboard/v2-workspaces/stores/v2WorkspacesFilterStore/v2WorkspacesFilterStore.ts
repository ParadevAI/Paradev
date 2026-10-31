import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";
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
export type V2WorkspacesGroupBy =
	| "status"
	| "project"
	| "where"
	| "creator"
	| "none";
export type V2WorkspacesOrderBy = "activity" | "created" | "name";

export const GROUP_BY_VALUES: V2WorkspacesGroupBy[] = [
	"status",
	"project",
	"where",
	"creator",
	"none",
];
export const ORDER_BY_VALUES: V2WorkspacesOrderBy[] = [
	"activity",
	"created",
	"name",
];

/** The filter set a view pins; the chips row edits a copy of it. */
export interface V2WorkspacesViewFilters {
	whereFilter: V2WorkspacesWhereFilter;
	/** Empty = all projects. May contain PROJECT_FILTER_SESSIONS. */
	projectFilters: string[];
	/** Creator user ids; empty = any creator. */
	creatorFilters: string[];
	/** Status buckets (board columns); empty = every bucket. */
	statusFilters: BoardColumnKey[];
	/** Archived tombstones render in their own last sections (both views). */
	showArchived: boolean;
}

export interface V2WorkspacesSavedView {
	id: string;
	name: string;
	filters: V2WorkspacesViewFilters;
}

export const BUILT_IN_VIEW_ALL = "all";
export const BUILT_IN_VIEW_NEEDS_ME = "needs-me";
export const BUILT_IN_VIEW_WORKING = "working";
export const BUILT_IN_VIEW_CLOUD = "cloud";

export const EMPTY_VIEW_FILTERS: V2WorkspacesViewFilters = {
	whereFilter: WHERE_FILTER_ANYWHERE,
	projectFilters: [],
	creatorFilters: [],
	statusFilters: [],
	showArchived: false,
};

/** Fixed presets; saved views are the user's own on top of these. */
export const BUILT_IN_VIEW_FILTERS: Record<string, V2WorkspacesViewFilters> = {
	[BUILT_IN_VIEW_ALL]: EMPTY_VIEW_FILTERS,
	[BUILT_IN_VIEW_NEEDS_ME]: {
		...EMPTY_VIEW_FILTERS,
		statusFilters: ["attention", "finished"],
	},
	[BUILT_IN_VIEW_WORKING]: {
		...EMPTY_VIEW_FILTERS,
		statusFilters: ["working"],
	},
	[BUILT_IN_VIEW_CLOUD]: {
		...EMPTY_VIEW_FILTERS,
		whereFilter: WHERE_FILTER_CLOUD,
	},
};

/** Bounds the persisted blob: views are small, but the list must not grow forever. */
export const MAX_SAVED_VIEWS = 20;

export function isKnownView(
	viewId: string,
	savedViews: V2WorkspacesSavedView[],
): boolean {
	return isBuiltInView(viewId) || savedViews.some((view) => view.id === viewId);
}

/** Own-property check: `?tab=constructor` must not read as a view. */
export function isBuiltInView(viewId: string): boolean {
	return Object.hasOwn(BUILT_IN_VIEW_FILTERS, viewId);
}

export function getViewFilters(
	viewId: string,
	savedViews: V2WorkspacesSavedView[],
): V2WorkspacesViewFilters {
	return (
		(isBuiltInView(viewId) ? BUILT_IN_VIEW_FILTERS[viewId] : undefined) ??
		savedViews.find((view) => view.id === viewId)?.filters ??
		EMPTY_VIEW_FILTERS
	);
}

const stringList = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];

/** Rehydrated or deep-linked filters may name buckets or shapes this build no
 * longer knows; drop what it cannot render instead of throwing in the header. */
export function sanitizeViewFilters(
	filters: Partial<V2WorkspacesViewFilters> | null | undefined,
): V2WorkspacesViewFilters {
	return {
		whereFilter:
			typeof filters?.whereFilter === "string" && filters.whereFilter
				? filters.whereFilter
				: WHERE_FILTER_ANYWHERE,
		projectFilters: stringList(filters?.projectFilters),
		creatorFilters: stringList(filters?.creatorFilters),
		statusFilters: stringList(filters?.statusFilters).filter(
			(value): value is BoardColumnKey =>
				(BOARD_COLUMN_ORDER as string[]).includes(value),
		),
		showArchived: filters?.showArchived === true,
	};
}

function sanitizeSavedViews(value: unknown): V2WorkspacesSavedView[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const views: V2WorkspacesSavedView[] = [];
	for (const entry of value) {
		if (
			typeof entry?.id !== "string" ||
			typeof entry?.name !== "string" ||
			seen.has(entry.id)
		) {
			continue;
		}
		seen.add(entry.id);
		views.push({
			id: entry.id,
			name: entry.name,
			filters: sanitizeViewFilters(entry.filters),
		});
	}
	return views.slice(0, MAX_SAVED_VIEWS);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export function sameViewFilters(
	a: V2WorkspacesViewFilters,
	b: V2WorkspacesViewFilters,
): boolean {
	return (
		a.whereFilter === b.whereFilter &&
		a.showArchived === b.showArchived &&
		sameList(a.projectFilters, b.projectFilters) &&
		sameList(a.creatorFilters, b.creatorFilters) &&
		sameList(a.statusFilters, b.statusFilters)
	);
}

function copyFilters(
	filters: V2WorkspacesViewFilters,
): V2WorkspacesViewFilters {
	return {
		whereFilter: filters.whereFilter,
		projectFilters: [...filters.projectFilters],
		creatorFilters: [...filters.creatorFilters],
		statusFilters: [...filters.statusFilters],
		showArchived: filters.showArchived,
	};
}

interface V2WorkspacesFilterState extends V2WorkspacesViewFilters {
	searchQuery: string;
	viewMode: V2WorkspacesViewMode;
	groupBy: V2WorkspacesGroupBy;
	orderBy: V2WorkspacesOrderBy;
	/** A BUILT_IN_VIEW_* id or a saved view's id. */
	activeViewId: string;
	savedViews: V2WorkspacesSavedView[];
	setSearchQuery: (searchQuery: string) => void;
	setWhereFilter: (whereFilter: V2WorkspacesWhereFilter) => void;
	setProjectFilters: (projectFilters: string[]) => void;
	setCreatorFilters: (creatorFilters: string[]) => void;
	setStatusFilters: (statusFilters: BoardColumnKey[]) => void;
	setShowArchived: (showArchived: boolean) => void;
	setViewMode: (viewMode: V2WorkspacesViewMode) => void;
	setGroupBy: (groupBy: V2WorkspacesGroupBy) => void;
	setOrderBy: (orderBy: V2WorkspacesOrderBy) => void;
	/** Switches view and replaces the filters with the view's own; an
	 * unknown id (deleted view, another machine's link) lands on All. */
	applyView: (viewId: string) => void;
	/** Switches the active tab only; the current filters stay as they are. */
	setActiveViewId: (viewId: string) => void;
	/** Puts the current filters back to the active view's. */
	resetToView: () => void;
	/** Writes the current filters into the active saved view. No-op on a built-in. */
	saveView: () => void;
	/** Saves the current filters as a new view and makes it active. Returns
	 * false, saving nothing, once MAX_SAVED_VIEWS is reached. */
	saveAsNewView: (name: string) => boolean;
	deleteView: (viewId: string) => void;
	/** Clears filters (incl. archived) and lands on All — layout persists. */
	reset: () => void;
}

export const useV2WorkspacesFilterStore = create<V2WorkspacesFilterState>()(
	persist(
		(set, get) => ({
			searchQuery: "",
			...EMPTY_VIEW_FILTERS,
			viewMode: "list",
			groupBy: "none",
			orderBy: "activity",
			activeViewId: BUILT_IN_VIEW_ALL,
			savedViews: [],
			setSearchQuery: (searchQuery) => set({ searchQuery }),
			setWhereFilter: (whereFilter) => set({ whereFilter }),
			setProjectFilters: (projectFilters) => set({ projectFilters }),
			setCreatorFilters: (creatorFilters) => set({ creatorFilters }),
			setStatusFilters: (statusFilters) => set({ statusFilters }),
			setShowArchived: (showArchived) => set({ showArchived }),
			setViewMode: (viewMode) => set({ viewMode }),
			setGroupBy: (groupBy) => set({ groupBy }),
			setOrderBy: (orderBy) => set({ orderBy }),
			applyView: (viewId) =>
				set((state) => {
					const resolved = isKnownView(viewId, state.savedViews)
						? viewId
						: BUILT_IN_VIEW_ALL;
					return {
						activeViewId: resolved,
						...copyFilters(getViewFilters(resolved, state.savedViews)),
					};
				}),
			setActiveViewId: (viewId) =>
				set((state) => ({
					activeViewId: isKnownView(viewId, state.savedViews)
						? viewId
						: BUILT_IN_VIEW_ALL,
				})),
			resetToView: () =>
				set((state) => ({
					...copyFilters(getViewFilters(state.activeViewId, state.savedViews)),
				})),
			saveView: () =>
				set((state) => ({
					savedViews: state.savedViews.map((view) =>
						view.id === state.activeViewId
							? { ...view, filters: copyFilters(state) }
							: view,
					),
				})),
			saveAsNewView: (name) => {
				if (get().savedViews.length >= MAX_SAVED_VIEWS) return false;
				const id = crypto.randomUUID();
				set((state) => ({
					activeViewId: id,
					savedViews: [
						...state.savedViews,
						{
							id,
							name: name.trim() || defaultViewName(state.savedViews),
							filters: copyFilters(state),
						},
					],
				}));
				return true;
			},
			deleteView: (viewId) => {
				const wasActive = get().activeViewId === viewId;
				set((state) => ({
					savedViews: state.savedViews.filter((view) => view.id !== viewId),
					...(wasActive && {
						activeViewId: BUILT_IN_VIEW_ALL,
						...copyFilters(EMPTY_VIEW_FILTERS),
					}),
				}));
			},
			reset: () =>
				set({
					searchQuery: "",
					activeViewId: BUILT_IN_VIEW_ALL,
					...copyFilters(EMPTY_VIEW_FILTERS),
				}),
		}),
		{
			name: "v2-workspaces-view",
			// Bounded: three enums plus at most MAX_SAVED_VIEWS small filter
			// sets. Filters and search stay per-visit (a deep link still wins —
			// the page hydrates URL params over the rehydrated value on mount).
			partialize: (state) => ({
				viewMode: state.viewMode,
				groupBy: state.groupBy,
				orderBy: state.orderBy,
				savedViews: state.savedViews,
			}),
			merge: (persisted, current) => {
				const stored = (persisted ?? {}) as Partial<
					Pick<
						V2WorkspacesFilterState,
						"viewMode" | "groupBy" | "orderBy" | "savedViews"
					>
				>;
				return {
					...current,
					...(stored.viewMode === "list" || stored.viewMode === "board"
						? { viewMode: stored.viewMode }
						: {}),
					...(stored.groupBy !== undefined &&
					GROUP_BY_VALUES.includes(stored.groupBy)
						? { groupBy: stored.groupBy }
						: {}),
					...(stored.orderBy !== undefined &&
					ORDER_BY_VALUES.includes(stored.orderBy)
						? { orderBy: stored.orderBy }
						: {}),
					savedViews: sanitizeSavedViews(stored.savedViews),
				};
			},
		},
	),
);

function defaultViewName(savedViews: V2WorkspacesSavedView[]): string {
	return `View ${savedViews.length + 1}`;
}
