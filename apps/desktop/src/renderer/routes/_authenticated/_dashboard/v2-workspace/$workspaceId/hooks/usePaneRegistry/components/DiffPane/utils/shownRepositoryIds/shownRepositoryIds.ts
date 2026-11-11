/**
 * The checkouts a multi-repo diff shows: the picked ones that still exist, or
 * all of them when none is picked or every pick is gone.
 */
export function shownRepositoryIds(
	repositoryIds: string[],
	picked: string[] | undefined,
): Set<string> {
	const available = new Set(repositoryIds);
	const kept = (picked ?? []).filter((id) => available.has(id));
	return kept.length > 0 ? new Set(kept) : available;
}
