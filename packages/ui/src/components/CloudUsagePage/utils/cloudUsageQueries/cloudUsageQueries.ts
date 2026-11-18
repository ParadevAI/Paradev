import type { usageRange } from "../usageRange";

const PAGE_SIZE = 25;
const CHART_LIMIT = 100;

export const PERIODS_INPUT = { limit: 24 } as const;

/** Inputs and enable rules for the page's queries, so every app asks for the same data. */
export function cloudUsageQueries({
	range,
	periodsLoaded,
	isAdmin,
	workspaceId,
}: {
	range: ReturnType<typeof usageRange>;
	periodsLoaded: boolean;
	isAdmin: boolean;
	workspaceId: string | undefined;
}) {
	return {
		byDay: {
			input: { range, groupBy: "day", limit: CHART_LIMIT } as const,
			enabled: periodsLoaded,
		},
		byPerson: {
			input: { range, groupBy: "user", limit: CHART_LIMIT } as const,
			enabled: periodsLoaded && isAdmin,
		},
		workspaces: {
			input: { range, groupBy: "workspace", limit: PAGE_SIZE } as const,
			enabled: periodsLoaded,
		},
		boots: {
			input: { workspace: workspaceId, range, limit: PAGE_SIZE },
			enabled: workspaceId !== undefined,
		},
	};
}
