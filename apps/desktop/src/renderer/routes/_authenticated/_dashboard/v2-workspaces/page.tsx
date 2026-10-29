import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useRef } from "react";
import { V2WorkspacesBoard } from "./components/V2WorkspacesBoard";
import { V2WorkspacesHeader } from "./components/V2WorkspacesHeader";
import { V2WorkspacesList } from "./components/V2WorkspacesList";
import { useAccessibleV2Workspaces } from "./hooks/useAccessibleV2Workspaces";
import {
	useV2WorkspacesFilterStore,
	type V2WorkspacesViewMode,
	WHERE_FILTER_ANYWHERE,
} from "./stores/v2WorkspacesFilterStore";

export type V2WorkspacesSearch = {
	q?: string;
	/** A WHERE_FILTER_* sentinel or a machine id; omitted = anywhere. */
	where?: string;
	/** Comma-joined project ids; may include the `__sessions__` sentinel. */
	projects?: string;
	/** Comma-joined creator user ids. */
	creators?: string;
	view?: V2WorkspacesViewMode;
	/** Archived tombstones shown; omitted = hidden. */
	archived?: true;
};

function parseList(raw: unknown): string[] {
	if (typeof raw !== "string" || !raw) return [];
	return raw.split(",").filter(Boolean);
}

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
		view:
			search.view === "board" || search.view === "list"
				? search.view
				: undefined,
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
	const showArchived = useV2WorkspacesFilterStore(
		(state) => state.showArchived,
	);
	const viewMode = useV2WorkspacesFilterStore((state) => state.viewMode);

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
			...(search.where !== undefined && { whereFilter: search.where }),
			...(search.projects !== undefined && {
				projectFilters: parseList(search.projects),
			}),
			...(search.creators !== undefined && {
				creatorFilters: parseList(search.creators),
			}),
			...(search.view !== undefined && { viewMode: search.view }),
			...(search.archived !== undefined && { showArchived: search.archived }),
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
					view: viewMode !== "list" ? viewMode : undefined,
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
		viewMode,
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

	// Re-rendering hundreds of rows takes hundreds of ms; deferring keeps
	// filter menus and checkboxes painting instantly while the list catches
	// up at background priority. isReady must lag with the rows — both
	// deferred values flip in the same background render, whereas a sync
	// isReady=true against still-empty deferred rows would flash the empty
	// state while the first rows are being rendered.
	const deferredWorkspaces = useDeferredValue(all);
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
	);
}
