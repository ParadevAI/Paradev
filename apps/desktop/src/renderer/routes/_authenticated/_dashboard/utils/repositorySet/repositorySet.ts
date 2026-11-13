/** The GitHub `owner/name` of each repository that has one. */
export function repositoryFullNames(
	repositories: readonly { owner: string | null; repoName: string | null }[],
): string[] {
	return repositories.flatMap((repository) =>
		repository.owner && repository.repoName
			? [`${repository.owner}/${repository.repoName}`]
			: [],
	);
}

/** Whether two lists name the same repositories, in any order and case. */
export function isSameRepositorySet(
	left: readonly string[],
	right: readonly string[],
): boolean {
	const normalize = (names: readonly string[]) =>
		[...new Set(names.map((name) => name.toLowerCase()))].sort();
	const a = normalize(left);
	const b = normalize(right);
	return a.length === b.length && a.every((name, index) => name === b[index]);
}

/** Whether a project holds these repositories and no others, local-only ones included. */
export function holdsExactRepositorySet(
	repositories: readonly { owner: string | null; repoName: string | null }[],
	names: readonly string[],
): boolean {
	const distinct = new Set(names.map((name) => name.toLowerCase()));
	return (
		repositories.length === distinct.size &&
		isSameRepositorySet(repositoryFullNames(repositories), names)
	);
}

/** The GitHub `owner/name` of each checkout's repository; null when one has none. */
export function checkoutRepositoryFullNames(
	checkouts: readonly { repositoryId: string }[],
	repositories: readonly {
		id: string;
		owner: string | null;
		repoName: string | null;
	}[],
): string[] | null {
	if (checkouts.length === 0) return null;
	const byId = new Map(
		repositories.map((repository) => [repository.id, repository]),
	);
	const names: string[] = [];
	for (const checkout of checkouts) {
		const repository = byId.get(checkout.repositoryId);
		if (!repository?.owner || !repository.repoName) return null;
		names.push(`${repository.owner}/${repository.repoName}`);
	}
	return names;
}
