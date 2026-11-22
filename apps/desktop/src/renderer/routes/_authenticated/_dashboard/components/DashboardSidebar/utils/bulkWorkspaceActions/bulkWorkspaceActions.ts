export function workspaceIdsForSectionMove(
	workspaceIds: readonly string[],
	sectionByWorkspaceId: ReadonlyMap<string, string>,
	targetSectionId: string | null,
): string[] {
	return workspaceIds.filter(
		(workspaceId) =>
			(sectionByWorkspaceId.get(workspaceId) ?? null) !== targetSectionId,
	);
}

export function splitBulkRemovalTargets<Workspace extends { hostType: string }>(
	workspaces: readonly Workspace[],
): { deletable: Workspace[]; archivable: Workspace[] } {
	const deletable: Workspace[] = [];
	const archivable: Workspace[] = [];
	for (const workspace of workspaces) {
		(workspace.hostType === "cloud" ? archivable : deletable).push(workspace);
	}
	return { deletable, archivable };
}
