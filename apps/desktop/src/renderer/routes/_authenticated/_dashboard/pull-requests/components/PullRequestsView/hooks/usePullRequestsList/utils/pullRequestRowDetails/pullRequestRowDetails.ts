interface PullRequestRowKey {
	projectId: string;
	prNumber: number;
	/** The project's repository holding the PR. */
	repositoryId?: string;
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

/** PR numbers repeat across repositories, so a row is its project, repository and number. */
export function pullRequestRowKey(row: PullRequestRowKey): string {
	return `${row.projectId}:${row.repositoryId ?? ""}:${row.prNumber}`;
}

/** The host serves details for one-repository projects only, without the repository. */
function projectRowKey(row: PullRequestRowKey): string {
	return `${row.projectId}::${row.prNumber}`;
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
	const rowsPerProjectKey = new Map<string, number>();
	for (const row of page.pullRequests) {
		const key = projectRowKey(row);
		rowsPerProjectKey.set(key, (rowsPerProjectKey.get(key) ?? 0) + 1);
	}
	return {
		...page,
		pullRequests: page.pullRequests.map((row) => {
			const detail =
				detailByKey.get(pullRequestRowKey(row)) ??
				(rowsPerProjectKey.get(projectRowKey(row)) === 1
					? detailByKey.get(projectRowKey(row))
					: undefined);
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
): { projectId: string; repositoryId?: string; prNumbers: number[] }[] {
	const groups = new Map<
		string,
		{ projectId: string; repositoryId?: string; prNumbers: number[] }
	>();
	for (const row of rows) {
		const key = `${row.projectId}:${row.repositoryId ?? ""}`;
		const group = groups.get(key) ?? {
			projectId: row.projectId,
			...(row.repositoryId ? { repositoryId: row.repositoryId } : {}),
			prNumbers: [],
		};
		group.prNumbers.push(row.prNumber);
		groups.set(key, group);
	}
	return [...groups.values()];
}
