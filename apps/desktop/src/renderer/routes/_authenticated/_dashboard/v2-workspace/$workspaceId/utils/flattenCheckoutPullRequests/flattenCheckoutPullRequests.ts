/** One list of a workspace's pull requests, each carrying the repository of the checkout that links it. */
export function flattenCheckoutPullRequests<T extends object>(
	checkouts: Array<{ repositoryId: string; pullRequests: T[] }> | undefined,
): Array<T & { repositoryId: string }> {
	return (checkouts ?? []).flatMap(({ repositoryId, pullRequests }) =>
		pullRequests.map((pullRequest) => ({ ...pullRequest, repositoryId })),
	);
}
