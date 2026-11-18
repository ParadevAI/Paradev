import type { usageRange } from "../usageRange";

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const TOP_WORKSPACES = 8;

export const PERIODS_INPUT = { limit: 24 } as const;

/** Inputs and enable rules for the pages' queries, so every app asks for the same data. */
export function cloudUsageQueries({
	range,
	periodsLoaded,
	isAdmin,
	workspaceId,
	person,
}: {
	range: ReturnType<typeof usageRange>;
	periodsLoaded: boolean;
	isAdmin: boolean;
	workspaceId?: string;
	/** The router cannot filter by person yet, so the Workspaces page loads every page and filters. */
	person?: string;
}) {
	return {
		byDay: {
			input: { range, groupBy: "day", limit: MAX_PAGE_SIZE } as const,
			enabled: periodsLoaded,
		},
		byPerson: {
			input: { range, groupBy: "user", limit: MAX_PAGE_SIZE } as const,
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
				limit: person ? MAX_PAGE_SIZE : PAGE_SIZE,
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
