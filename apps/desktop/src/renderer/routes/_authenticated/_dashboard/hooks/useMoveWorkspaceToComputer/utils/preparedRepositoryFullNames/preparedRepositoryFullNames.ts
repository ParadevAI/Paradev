/**
 * The repositories a prepared move pushed. A box keeps the host-service of its
 * image, so a box made before multi-repo workspaces answers with its one
 * `repositoryFullName` and no `snapshots`.
 */
export function preparedRepositoryFullNames(prepared: {
	snapshots?: ReadonlyArray<{ repositoryFullName: string }>;
}): string[] | null {
	if (Array.isArray(prepared.snapshots)) {
		return prepared.snapshots.map((snapshot) => snapshot.repositoryFullName);
	}
	const legacy = (prepared as { repositoryFullName?: unknown })
		.repositoryFullName;
	return typeof legacy === "string" ? [legacy] : null;
}
