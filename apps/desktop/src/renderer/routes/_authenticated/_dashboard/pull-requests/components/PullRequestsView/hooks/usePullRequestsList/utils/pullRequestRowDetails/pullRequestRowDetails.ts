interface PullRequestRowKey {
	projectId: string;
	prNumber: number;
}

type PullRequestRowDetailField =
	| "checks"
	| "checksStatus"
	| "additions"
	| "deletions"
	| "headRefName";

type PullRequestRow = PullRequestRowKey &
	Record<PullRequestRowDetailField, unknown> & {
		detailsPending: boolean;
		detailsCarried?: boolean;
	};

type PullRequestRowDetails<TRow extends PullRequestRow> = Pick<
	TRow,
	keyof PullRequestRowKey | PullRequestRowDetailField
>;

/** PR numbers repeat across repositories, so a row is its project plus its number. */
export function pullRequestRowKey(row: PullRequestRowKey): string {
	return `${row.projectId}:${row.prNumber}`;
}

function mergeRowDetails<
	TRow extends PullRequestRow,
	TPage extends { pullRequests: TRow[] },
>(
	page: TPage,
	details: readonly PullRequestRowDetails<TRow>[],
	state: { detailsPending: boolean; detailsCarried: boolean },
): TPage {
	if (details.length === 0) return page;
	const detailByKey = new Map(
		details.map((detail) => [pullRequestRowKey(detail), detail]),
	);
	return {
		...page,
		pullRequests: page.pullRequests.map((row) => {
			const detail = detailByKey.get(pullRequestRowKey(row));
			if (!detail) return row;
			return {
				...row,
				checks: detail.checks,
				checksStatus: detail.checksStatus,
				additions: detail.additions,
				deletions: detail.deletions,
				headRefName: detail.headRefName,
				...state,
			};
		}),
	};
}

/** Fills each row's checks, diff stat and branch from a fresh detail with the same project and number. */
export function applyPullRequestRowDetails<
	TRow extends PullRequestRow,
	TPage extends { pullRequests: TRow[] },
>(page: TPage, details: readonly PullRequestRowDetails<TRow>[]): TPage {
	return mergeRowDetails(page, details, {
		detailsPending: false,
		detailsCarried: false,
	});
}

/**
 * Shows the previous fetch's details on a refetch, still pending: only a
 * fresh detail confirms them, so a failed refetch never passes them off as current.
 */
export function carryOverPullRequestRowDetails<
	TRow extends PullRequestRow,
	TPage extends { pullRequests: TRow[] },
>(page: TPage, previousRows: readonly TRow[]): TPage {
	return mergeRowDetails(
		page,
		previousRows.filter((row) => !row.detailsPending || row.detailsCarried),
		{ detailsPending: true, detailsCarried: true },
	);
}

export function pullRequestNumbersByProject(
	rows: readonly PullRequestRowKey[],
): { projectId: string; prNumbers: number[] }[] {
	const numbersByProject = new Map<string, number[]>();
	for (const row of rows) {
		const numbers = numbersByProject.get(row.projectId) ?? [];
		numbers.push(row.prNumber);
		numbersByProject.set(row.projectId, numbers);
	}
	return [...numbersByProject].map(([projectId, prNumbers]) => ({
		projectId,
		prNumbers,
	}));
}
