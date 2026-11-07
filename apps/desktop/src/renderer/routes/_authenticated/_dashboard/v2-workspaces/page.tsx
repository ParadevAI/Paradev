import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { V2WorkspacesBoard } from "./components/V2WorkspacesBoard";
import { V2WorkspacesHeader } from "./components/V2WorkspacesHeader";
import {
	VIEWS_PANEL_ID,
	viewTabId,
} from "./components/V2WorkspacesHeader/components/V2WorkspacesViewsBar";
import { V2WorkspacesList } from "./components/V2WorkspacesList";
import { useAccessibleV2Workspaces } from "./hooks/useAccessibleV2Workspaces";
import {
	BUILT_IN_VIEW_ALL,
	BUILT_IN_VIEW_CLOUD,
	useV2WorkspacesFilterStore,
	type V2WorkspacesGroupBy,
	type V2WorkspacesOrderBy,
	type V2WorkspacesViewMode,
	WHERE_FILTER_ANYWHERE,
} from "./stores/v2WorkspacesFilterStore";
import { deriveBoardColumn } from "./utils/deriveBoardColumn";
import {
	hydrateFiltersFromSearch,
	parseGroupBy,
	parseOrderBy,
} from "./utils/parseWorkspacesSearch";

export type V2WorkspacesSearch = {
	q?: string;
	/** A WHERE_FILTER_* sentinel or a machine id; omitted = anywhere. */
	where?: string;
	/** Comma-joined project ids; may include the `__sessions__` sentinel. */
	projects?: string;
	/** Comma-joined creator user ids. */
	creators?: string;
	/** Comma-joined status buckets (board column keys). */
	status?: string;
	view?: V2WorkspacesViewMode;
	group?: V2WorkspacesGroupBy;
	order?: V2WorkspacesOrderBy;
	/** A built-in view id or a saved view's id; omitted = All. */
	tab?: string;
	/** Archived tombstones shown; omitted = hidden. */
	archived?: true;
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspaces/",
)({
	component: V2WorkspacesPage,
	validateSearch: (search: Record<string, unknown>): V2WorkspacesSearch => ({
		q: typeof search.q === "string" && search.q ? search.q : undefined,
		where:
			typeof search.where === "string" && search.where
				? search.where
				: undefined,
		projects:
			typeof search.projects === "string" && search.projects
				? search.projects
				: undefined,
		creators:
			typeof search.creators === "string" && search.creators
				? search.creators
				: undefined,
		status:
			typeof search.status === "string" && search.status
				? search.status
				: undefined,
		view:
			search.view === "board" || search.view === "list"
				? search.view
				: undefined,
		group: parseGroupBy(search.group),
		order: parseOrderBy(search.order),
		tab: typeof search.tab === "string" && search.tab ? search.tab : undefined,
		archived: search.archived === true ? true : undefined,
	}),
});

function V2WorkspacesPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
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
	const viewMode = useV2WorkspacesFilterStore((state) => state.viewMode);
	const groupBy = useV2WorkspacesFilterStore((state) => state.groupBy);
	const orderBy = useV2WorkspacesFilterStore((state) => state.orderBy);
	const activeViewId = useV2WorkspacesFilterStore(
		(state) => state.activeViewId,
	);

	// URL → store, once per mount, and only for params the URL actually
	// carries: a deep link reproduces its view exactly, while a bare
	// sidebar navigation must NOT reset the user's board/filter state back
	// to defaults. After hydration the store drives and the URL follows
	// (replace, so filter tweaks don't pollute history). The search text is
	// the exception — like the old page, it resets on every visit unless
	// the link pins it.
	const hydratedRef = useRef(false);
	if (!hydratedRef.current) {
		hydratedRef.current = true;
		useV2WorkspacesFilterStore.setState({
			searchQuery: search.q ?? "",
			...hydrateFiltersFromSearch(
				search,
				useV2WorkspacesFilterStore.getState().savedViews,
			),
			...(search.view !== undefined && { viewMode: search.view }),
			...(search.group !== undefined && { groupBy: search.group }),
			...(search.order !== undefined && { orderBy: search.order }),
		});
	}

	// Debounced: each navigate() re-renders every router-state subscriber
	// app-wide (the dashboard sidebar most expensively), so syncing per
	// keystroke made typing in the search box wait on full sidebar renders.
	// The URL is only a deep-link mirror — one trailing update suffices.
	useEffect(() => {
		const timeout = setTimeout(() => {
			const syncUrl = navigate({
				search: {
					q: searchQuery || undefined,
					where:
						whereFilter !== WHERE_FILTER_ANYWHERE ? whereFilter : undefined,
					projects: projectFilters.length
						? projectFilters.join(",")
						: undefined,
					creators: creatorFilters.length
						? creatorFilters.join(",")
						: undefined,
					status: statusFilters.length ? statusFilters.join(",") : undefined,
					tab: activeViewId !== BUILT_IN_VIEW_ALL ? activeViewId : undefined,
					view: viewMode !== "list" ? viewMode : undefined,
					group: groupBy !== "none" ? groupBy : undefined,
					order: orderBy !== "activity" ? orderBy : undefined,
					archived: showArchived ? true : undefined,
				},
				replace: true,
			});
			void Promise.resolve(syncUrl).catch((error) => {
				console.error("[v2-workspaces] filter URL sync failed", error);
			});
		}, 300);
		return () => clearTimeout(timeout);
	}, [
		navigate,
		searchQuery,
		whereFilter,
		projectFilters,
		creatorFilters,
		statusFilters,
		activeViewId,
		viewMode,
		groupBy,
		orderBy,
		showArchived,
	]);

	// Deferred so per-keystroke filtering leaves the input's critical path:
	// the sync render reuses the previous results and the recompute follows
	// at background priority.
	const deferredSearchQuery = useDeferredValue(searchQuery);

	const {
		all,
		isReady,
		hostOptions,
		projectOptions,
		creatorOptions,
		hostsById,
		projectsById,
		cloudEnabled,
	} = useAccessibleV2Workspaces({
		searchQuery: deferredSearchQuery,
		whereFilter,
		projectFilters,
		creatorFilters,
		includeArchived: showArchived,
	});

	// No cloud in this org: the Cloud tab is hidden, so land on All but keep
	// whatever filters the link carried (the host source already reads an
	// unavailable cloud place as Anywhere).
	const setActiveViewId = useV2WorkspacesFilterStore(
		(state) => state.setActiveViewId,
	);
	useEffect(() => {
		if (activeViewId === BUILT_IN_VIEW_CLOUD && isReady && !cloudEnabled) {
			setActiveViewId(BUILT_IN_VIEW_ALL);
		}
	}, [activeViewId, isReady, cloudEnabled, setActiveViewId]);

	// Status buckets are derived per row, so they filter here rather than in
	// the hook, which only knows about sources and identities.
	const byStatus = useMemo(
		() =>
			statusFilters.length === 0
				? all
				: all.filter((workspace) =>
						statusFilters.includes(deriveBoardColumn(workspace)),
					),
		[all, statusFilters],
	);

	// Re-rendering hundreds of rows takes hundreds of ms; deferring keeps
	// filter menus and checkboxes painting instantly while the list catches
	// up at background priority. isReady must lag with the rows — both
	// deferred values flip in the same background render, whereas a sync
	// isReady=true against still-empty deferred rows would flash the empty
	// state while the first rows are being rendered.
	const deferredWorkspaces = useDeferredValue(byStatus);
	const deferredIsReady = useDeferredValue(isReady);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<V2WorkspacesHeader
				hostOptions={hostOptions}
				projectOptions={projectOptions}
				creatorOptions={creatorOptions}
				hostsById={hostsById}
				projectsById={projectsById}
				cloudEnabled={cloudEnabled}
			/>
			<div
				role="tabpanel"
				id={VIEWS_PANEL_ID}
				aria-labelledby={viewTabId(activeViewId)}
				className="flex min-h-0 flex-1 flex-col"
			>
				{viewMode === "board" ? (
					<V2WorkspacesBoard
						workspaces={deferredWorkspaces}
						isReady={deferredIsReady}
					/>
				) : (
					<V2WorkspacesList
						workspaces={deferredWorkspaces}
						isReady={deferredIsReady}
					/>
				)}
			</div>
		</div>
	);
}
