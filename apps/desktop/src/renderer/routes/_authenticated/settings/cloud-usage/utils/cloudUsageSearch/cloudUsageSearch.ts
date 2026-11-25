import {
	type WorkspacesFilters,
	workspacesFilters,
} from "@superset/ui/cloud-usage-page";

/** `period` is a period id; absent means the newest. The rest are the Workspaces page's filters. */
export function cloudUsageSearch(
	search: Record<string, unknown>,
): { period?: string } & WorkspacesFilters {
	const period = search.period;
	return {
		period:
			typeof period === "string" && period.length > 0 ? period : undefined,
		...workspacesFilters((key) => search[key]),
	};
}
