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
	Record<PullRequestRowDetailField, unknown> & { detailsPending: boolean };

/** PR numbers repeat across repositories, so a row is its project plus its number. */
export function pullRequestRowKey(row: PullRequestRowKey): string {
	return `${row.projectId}:${row.prNumber}`;
}

/** Fills each row's checks, diff stat and branch from the detail with the same project and number. */
export function applyPullRequestRowDetails<
	TRow extends PullRequestRow,
	TPage extends { pullRequests: TRow[] },
>(
	page: TPage,
	details: readonly Pick<
		TRow,
		keyof PullRequestRowKey | PullRequestRowDetailField
	>[],
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
				detailsPending: false,
			};
		}),
	};
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
