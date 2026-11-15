import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";

/** Each repository's changed paths, a path in two sections counted once. */
export function changedPathCountByRepository(
	files: ChangesetFile[],
): Map<string, number> {
	const paths = new Map<string, Set<string>>();
	for (const file of files) {
		if (!file.repositoryId) continue;
		const own = paths.get(file.repositoryId) ?? new Set<string>();
		own.add(file.path);
		paths.set(file.repositoryId, own);
	}
	return new Map(
		[...paths].map(([repositoryId, own]) => [repositoryId, own.size]),
	);
}
