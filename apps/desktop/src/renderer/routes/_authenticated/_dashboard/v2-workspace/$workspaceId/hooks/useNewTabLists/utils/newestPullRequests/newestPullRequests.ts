// Within one repository the PR number identifies a PR, even when a repository
// rename left an older link under the previous URL.
export function newestPullRequests<
	T extends { repositoryId: string; number: number; linkedAt: number },
>(history: readonly T[]): T[] {
	const newestFirst = [...history].sort((a, b) => b.linkedAt - a.linkedAt);
	const seen = new Set<string>();
	return newestFirst.filter((pr) => {
		const key = `${pr.repositoryId}#${pr.number}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
