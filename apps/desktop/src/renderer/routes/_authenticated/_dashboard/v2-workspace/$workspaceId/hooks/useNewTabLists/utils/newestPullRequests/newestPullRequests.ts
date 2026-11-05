// A workspace has one repository, so the PR number identifies a PR even when a
// repository rename left an older link under the previous URL.
export function newestPullRequests<
	T extends { number: number; linkedAt: number },
>(history: readonly T[]): T[] {
	const newestFirst = [...history].sort((a, b) => b.linkedAt - a.linkedAt);
	const seen = new Set<number>();
	return newestFirst.filter((pr) => {
		if (seen.has(pr.number)) return false;
		seen.add(pr.number);
		return true;
	});
}
