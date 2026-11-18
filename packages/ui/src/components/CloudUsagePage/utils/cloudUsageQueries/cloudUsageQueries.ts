import type { WorkspacesFilters } from "../../types";
import type { usageRange } from "../usageRange";

const PAGE_SIZE = 25;
const CHART_LIMIT = 100;
const TOP_WORKSPACES = 8;

export const PERIODS_INPUT = { limit: 24 } as const;

/** Inputs and enable rules for the pages' queries, so every app asks for the same data. */
export function cloudUsageQueries({
	range,
	periodsLoaded,
	isAdmin,
	workspaceId,
	filters = {},
}: {
	range: ReturnType<typeof usageRange>;
	periodsLoaded: boolean;
	isAdmin: boolean;
	workspaceId?: string;
	filters?: WorkspacesFilters;
}) {
	const { user, size, status, q, sort } = filters;
	return {
		byDay: {
			input: { range, groupBy: "day", limit: CHART_LIMIT } as const,
			enabled: periodsLoaded,
		},
		byPerson: {
			input: { range, groupBy: "user", limit: CHART_LIMIT } as const,
			enabled: periodsLoaded && isAdmin,
		},
		topWorkspaces: {
			input: { range, groupBy: "workspace", limit: TOP_WORKSPACES } as const,
			enabled: periodsLoaded,
		},
		workspaces: {
			input: {
				range,
				groupBy: "workspace",
				limit: PAGE_SIZE,
				user: isAdmin ? user : undefined,
				size,
				status: status && [status],
				search: q,
				sort,
				order: sort === "name" || sort === "status" ? "asc" : undefined,
			} as const,
			enabled: periodsLoaded,
		},
		workspace: {
			input: {
				range,
				workspace: workspaceId,
				groupBy: "workspace",
				limit: 1,
			} as const,
			enabled: periodsLoaded && workspaceId !== undefined,
		},
		boots: {
			input: { workspace: workspaceId, range, limit: PAGE_SIZE },
			enabled: periodsLoaded && workspaceId !== undefined,
		},
	};
}
