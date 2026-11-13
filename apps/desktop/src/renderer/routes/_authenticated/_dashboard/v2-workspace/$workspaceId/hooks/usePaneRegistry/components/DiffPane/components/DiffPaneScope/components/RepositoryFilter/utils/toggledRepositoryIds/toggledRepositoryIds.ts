/** The repositories to pick after toggling one; empty means show every repository. */
export function toggledRepositoryIds(
	repositoryCount: number,
	shown: ReadonlySet<string>,
	repositoryId: string,
): string[] {
	const next =
		shown.size === repositoryCount
			? [repositoryId]
			: shown.has(repositoryId)
				? [...shown].filter((id) => id !== repositoryId)
				: [...shown, repositoryId];
	return next.length === repositoryCount ? [] : next;
}
