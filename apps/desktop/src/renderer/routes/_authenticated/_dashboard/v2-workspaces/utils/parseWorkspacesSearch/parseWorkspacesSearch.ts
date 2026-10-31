import {
	BUILT_IN_VIEW_ALL,
	GROUP_BY_VALUES,
	getViewFilters,
	isKnownView,
	ORDER_BY_VALUES,
	type V2WorkspacesGroupBy,
	type V2WorkspacesOrderBy,
	type V2WorkspacesSavedView,
	type V2WorkspacesViewFilters,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";

export function parseList(raw: unknown): string[] {
	if (typeof raw !== "string" || !raw) return [];
	return raw.split(",").filter(Boolean);
}

/** Drops bucket names this build does not know (an old link, a typo). */
export function parseStatusList(raw: unknown): BoardColumnKey[] {
	return parseList(raw).filter((value): value is BoardColumnKey =>
		(BOARD_COLUMN_ORDER as string[]).includes(value),
	);
}

export function parseGroupBy(raw: unknown): V2WorkspacesGroupBy | undefined {
	return GROUP_BY_VALUES.includes(raw as V2WorkspacesGroupBy)
		? (raw as V2WorkspacesGroupBy)
		: undefined;
}

export function parseOrderBy(raw: unknown): V2WorkspacesOrderBy | undefined {
	return ORDER_BY_VALUES.includes(raw as V2WorkspacesOrderBy)
		? (raw as V2WorkspacesOrderBy)
		: undefined;
}

/** A link can name a view that was deleted, or one saved on another machine
 * (saved views live in this profile); such a link lands on All but keeps
 * the filters it carried. */
export function resolveViewId(
	tab: string | undefined,
	savedViews: V2WorkspacesSavedView[],
): string {
	return tab && isKnownView(tab, savedViews) ? tab : BUILT_IN_VIEW_ALL;
}

interface FilterSearchParams {
	tab?: string;
	where?: string;
	projects?: string;
	creators?: string;
	status?: string;
	archived?: true;
}

/**
 * Store fields a deep link pins. A `tab` starts from that view's own
 * filters, so `?tab=working` shows the Working view and not everything;
 * explicit params then override field by field. Without any of these
 * params the result is empty, so a bare navigation keeps the user's state.
 */
export function hydrateFiltersFromSearch(
	search: FilterSearchParams,
	savedViews: V2WorkspacesSavedView[],
): Partial<V2WorkspacesViewFilters & { activeViewId: string }> {
	const hasFilterParam =
		search.where !== undefined ||
		search.projects !== undefined ||
		search.creators !== undefined ||
		search.status !== undefined ||
		search.archived !== undefined;
	if (search.tab === undefined && !hasFilterParam) return {};
	const activeViewId = resolveViewId(search.tab, savedViews);
	const base =
		search.tab !== undefined ? getViewFilters(activeViewId, savedViews) : {};
	return {
		...(search.tab !== undefined && { activeViewId }),
		...base,
		...(search.where !== undefined && { whereFilter: search.where }),
		...(search.projects !== undefined && {
			projectFilters: parseList(search.projects),
		}),
		...(search.creators !== undefined && {
			creatorFilters: parseList(search.creators),
		}),
		...(search.status !== undefined && {
			statusFilters: parseStatusList(search.status),
		}),
		...(search.archived !== undefined && { showArchived: search.archived }),
	};
}
