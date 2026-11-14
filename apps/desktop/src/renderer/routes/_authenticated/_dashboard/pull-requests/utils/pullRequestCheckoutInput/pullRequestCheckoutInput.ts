/**
 * The `workspaces.create` fields that start a workspace from a PR: by the
 * repository id that holds it when known; else by its repository's GitHub
 * name, which the host matches against the live remote.
 */
export function pullRequestCheckoutInput({
	prNumber,
	repoFullName,
	repositoryId,
}: {
	prNumber: number;
	repoFullName: string | null;
	repositoryId: string | null;
}):
	| { pullRequest: { repository: string; number: number } }
	| { checkouts: Record<string, { pr: number }> }
	| null {
	if (repositoryId) return { checkouts: { [repositoryId]: { pr: prNumber } } };
	if (repoFullName) {
		return { pullRequest: { repository: repoFullName, number: prNumber } };
	}
	return null;
}
