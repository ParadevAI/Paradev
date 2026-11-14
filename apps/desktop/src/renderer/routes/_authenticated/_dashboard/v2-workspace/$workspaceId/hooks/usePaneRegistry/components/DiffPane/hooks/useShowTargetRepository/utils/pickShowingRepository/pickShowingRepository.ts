/**
 * The pick that also shows `repositoryId`, keeping the repositories already
 * shown; null when it is shown already or is not a checkout of the workspace.
 */
export function pickShowingRepository(
	repositoryIds: string[],
	shown: ReadonlySet<string>,
	repositoryId: string | undefined,
): string[] | null {
	if (!repositoryId || shown.has(repositoryId)) return null;
	if (!repositoryIds.includes(repositoryId)) return null;
	return repositoryIds.filter((id) => id === repositoryId || shown.has(id));
}
