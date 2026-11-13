/**
 * The `workspaces.create` fields that start a workspace from a PR: by its
 * repository's GitHub name when known, the host picking the checkout; else
 * by the repository id that holds it.
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
	if (repoFullName) {
		return { pullRequest: { repository: repoFullName, number: prNumber } };
	}
	if (repositoryId) return { checkouts: { [repositoryId]: { pr: prNumber } } };
	return null;
}
