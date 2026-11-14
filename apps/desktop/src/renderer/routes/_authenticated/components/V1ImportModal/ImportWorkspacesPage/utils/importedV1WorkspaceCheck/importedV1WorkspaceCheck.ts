interface HostWorkspace {
	projectId: string | null;
	branch: string;
	checkouts: { repositoryId: string }[];
}

interface V1WorkspaceTarget {
	v2ProjectId: string;
	repositoryId: string;
	multiRepo: boolean;
	branch: string;
}

/**
 * In a multi-repo project one v2 workspace holds several v1 workspaces on one
 * branch, so a v1 workspace counts as imported only when that v2 workspace
 * has a checkout of its own repository.
 */
export function importedV1WorkspaceCheck(
	hostWorkspaces: HostWorkspace[],
): (target: V1WorkspaceTarget) => boolean {
	const branchKeys = new Set<string>();
	const checkoutKeys = new Set<string>();
	for (const workspace of hostWorkspaces) {
		if (!workspace.projectId) continue;
		const branchKey = `${workspace.projectId}\0${workspace.branch}`;
		branchKeys.add(branchKey);
		for (const checkout of workspace.checkouts) {
			checkoutKeys.add(`${branchKey}\0${checkout.repositoryId}`);
		}
	}
	return ({ v2ProjectId, repositoryId, multiRepo, branch }) => {
		const branchKey = `${v2ProjectId}\0${branch}`;
		return multiRepo
			? checkoutKeys.has(`${branchKey}\0${repositoryId}`)
			: branchKeys.has(branchKey);
	};
}
