import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { WorkspacesBoard } from "./components/WorkspacesBoard";
import { WorkspacesHeader } from "./components/WorkspacesHeader";
import {
	VIEWS_PANEL_ID,
	viewTabId,
} from "./components/WorkspacesHeader/components/V2WorkspacesViewsBar";
import { WorkspacesList } from "./components/WorkspacesList";
import { useAccessibleWorkspaces } from "./hooks/useAccessibleWorkspaces";
import {
	BUILT_IN_VIEW_ALL,
	BUILT_IN_VIEW_CLOUD,
	useWorkspacesFilterStore,
	type V2WorkspacesGroupBy,
	type V2WorkspacesOrderBy,
	type WorkspacesViewMode,
	WHERE_FILTER_ANYWHERE,
} from "./stores/workspacesFilterStore";
import { deriveBoardColumn } from "./utils/deriveBoardColumn";
import {
	hydrateFiltersFromSearch,
	parseGroupBy,
	parseOrderBy,
} from "./utils/parseWorkspacesSearch";

export type WorkspacesSearch = {
	q?: string;
	/** A WHERE_FILTER_* sentinel or a machine id; omitted = anywhere. */
	where?: string;
	/** Comma-joined project ids; may include the `__sessions__` sentinel. */
	projects?: string;
	/** Comma-joined creator user ids. */
	creators?: string;
	/** Comma-joined status buckets (board column keys). */
	status?: string;
	view?: WorkspacesViewMode;
	group?: V2WorkspacesGroupBy;
	order?: V2WorkspacesOrderBy;
	/** A built-in view id or a saved view's id; omitted = All. */
	tab?: string;
	/** Archived tombstones shown; omitted = hidden. */
	archived?: true;
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/workspaces/",
)({
	component: WorkspacesPage,
	validateSearch: (search: Record<string, unknown>): WorkspacesSearch => ({
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

function WorkspacesPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	const searchQuery = useWorkspacesFilterStore((state) => state.searchQuery);
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
	const viewMode = useWorkspacesFilterStore((state) => state.viewMode);
	const groupBy = useWorkspacesFilterStore((state) => state.groupBy);
	const orderBy = useWorkspacesFilterStore((state) => state.orderBy);
	const activeViewId = useWorkspacesFilterStore(
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
		useWorkspacesFilterStore.setState({
			searchQuery: search.q ?? "",
			...hydrateFiltersFromSearch(
				search,
				useWorkspacesFilterStore.getState().savedViews,
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
	} = useAccessibleWorkspaces({
		searchQuery: deferredSearchQuery,
		whereFilter,
		projectFilters,
		creatorFilters,
		includeArchived: showArchived,
	});

	// No cloud in this org: the Cloud tab is hidden, so land on All but keep
	// whatever filters the link carried (the host source already reads an
	// unavailable cloud place as Anywhere).
	const setActiveViewId = useWorkspacesFilterStore(
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
			<WorkspacesHeader
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
					<WorkspacesBoard
						workspaces={deferredWorkspaces}
						isReady={deferredIsReady}
					/>
				) : (
					<WorkspacesList
						workspaces={deferredWorkspaces}
						isReady={deferredIsReady}
					/>
				)}
			</div>
		</div>
	);
}
