import type { WorkspacesFilters } from "../../types";
import { usageRange } from "../usageRange";
import { ROWS_PER_PAGE } from "../workspacesFilters";

const PAGE_SIZE = 25;
const CHART_LIMIT = 100;
const TOP_WORKSPACES = 8;
/** Before any cloud workspace existed. */
const ALL_TIME_FROM = "2024-01-01T00:00:00.000Z";

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
	const { user, size, status, q, sort, rows } = filters;
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
				limit: rows ?? ROWS_PER_PAGE[0],
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
		workspaceAllTime: {
			input: {
				range: { from: ALL_TIME_FROM, to: usageRange(undefined).to },
				workspace: workspaceId,
				groupBy: "workspace",
				limit: 1,
			} as const,
			enabled: workspaceId !== undefined,
		},
		boots: {
			input: { workspace: workspaceId, range, limit: PAGE_SIZE },
			enabled: periodsLoaded && workspaceId !== undefined,
		},
	};
}
