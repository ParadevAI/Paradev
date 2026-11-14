import type { RepositoryPullRequest } from "renderer/stores/new-workspace-draft";

type PullRequests = Record<string, RepositoryPullRequest>;

/**
 * The draft change that keeps the per-repository PRs on the linked PR: its
 * lookup once found, and nothing from an earlier PR while it is not. A
 * repository the user already picked a branch or worktree for keeps the pick.
 */
export function linkedPullRequestsUpdate({
	linkedPRUrl,
	appliedFor,
	found,
	pickedRepositoryIds,
}: {
	linkedPRUrl: string | null;
	appliedFor: string | null;
	found: PullRequests | null | undefined;
	pickedRepositoryIds: readonly string[];
}): {
	checkoutPullRequests: PullRequests;
	checkoutPullRequestsFor: string | null;
} | null {
	if (appliedFor === linkedPRUrl) return null;
	if (linkedPRUrl !== null && found) {
		return {
			checkoutPullRequests: Object.fromEntries(
				Object.entries(found).filter(
					([repositoryId]) => !pickedRepositoryIds.includes(repositoryId),
				),
			),
			checkoutPullRequestsFor: linkedPRUrl,
		};
	}
	if (appliedFor === null) return null;
	return { checkoutPullRequests: {}, checkoutPullRequestsFor: null };
}
