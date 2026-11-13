interface CheckoutPullRequest<PullRequest> {
	repositoryId: string | null;
	pullRequest: PullRequest | null;
}

interface CheckoutDiffStats {
	additions: number;
	deletions: number;
	fileCount: number;
}

/** The repository id of a workspace's primary checkout, if it has one. */
export function primaryCheckoutRepositoryId(workspace: {
	checkouts?: readonly { repositoryId: string; isPrimary: boolean }[];
}): string | null {
	return (
		workspace.checkouts?.find((checkout) => checkout.isPrimary)?.repositoryId ??
		null
	);
}

/** The checkout whose PR a workspace row shows: the primary's, else the first that has one. */
export function workspaceRowPullRequest<PullRequest>(
	checkouts: readonly CheckoutPullRequest<PullRequest>[],
	primaryRepositoryId: string | null,
): { repositoryId: string | null; pullRequest: PullRequest } | null {
	const checkout =
		checkouts.find(
			(candidate) =>
				candidate.repositoryId === primaryRepositoryId && candidate.pullRequest,
		) ?? checkouts.find((candidate) => candidate.pullRequest);
	return checkout?.pullRequest
		? { repositoryId: checkout.repositoryId, pullRequest: checkout.pullRequest }
		: null;
}

/** One workspace's diff stats: the sum over its checkouts. */
export function sumCheckoutDiffStats(
	checkouts: readonly CheckoutDiffStats[],
): CheckoutDiffStats {
	let additions = 0;
	let deletions = 0;
	let fileCount = 0;
	for (const checkout of checkouts) {
		additions += checkout.additions;
		deletions += checkout.deletions;
		fileCount += checkout.fileCount;
	}
	return { additions, deletions, fileCount };
}
