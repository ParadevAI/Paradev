/** What `pullRequests.getLinkedWorkspace` answers, and what the tab caches. */
export interface LinkedWorkspace {
	workspaceId: string | null;
}

interface ResolveLinkedWorkspaceIdArgs {
	/** The cached or freshly queried link, `undefined` before it answers. */
	workspaceId: string | null | undefined;
	/**
	 * Ids of every live workspace, or `null` while the mirror is still
	 * settling. Archived workspaces leave the mirror but keep their row, so
	 * absence from a settled mirror is what marks an id as no longer usable.
	 */
	liveWorkspaceIds: ReadonlySet<string> | null;
}

/**
 * The workspace a PR comment should be sent into, or `null` to create one.
 *
 * The tab seeds this query with the workspace a failed agent launch left
 * behind, which is how a retry avoids checking the PR out twice. That seed
 * outlives the workspace being deleted: deletion archives the row rather than
 * removing it, and `agents.run` looks a workspace up by id without checking
 * `archivedAt`, so sending into an archived id reports "Sent to agent" into a
 * workspace the user deleted. Drop the id once the mirror has settled without
 * it — never while it is still settling, which would create the second
 * checkout this seed exists to prevent.
 */
export function resolveLinkedWorkspaceId({
	workspaceId,
	liveWorkspaceIds,
}: ResolveLinkedWorkspaceIdArgs): string | null {
	if (!workspaceId) return null;
	if (liveWorkspaceIds === null) return workspaceId;
	return liveWorkspaceIds.has(workspaceId) ? workspaceId : null;
}
