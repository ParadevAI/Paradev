import type { RepositoryPullRequest } from "renderer/stores/new-workspace-draft";

type PullRequests = Record<string, RepositoryPullRequest>;

/**
 * The draft change that keeps the per-repository PRs on the linked PR: its
 * lookup once found, and nothing from an earlier PR while it is not.
 */
export function linkedPullRequestsUpdate({
	linkedPRUrl,
	appliedFor,
	found,
}: {
	linkedPRUrl: string | null;
	appliedFor: string | null;
	found: PullRequests | null | undefined;
}): {
	checkoutPullRequests: PullRequests;
	checkoutPullRequestsFor: string | null;
} | null {
	if (appliedFor === linkedPRUrl) return null;
	if (linkedPRUrl !== null && found) {
		return {
			checkoutPullRequests: found,
			checkoutPullRequestsFor: linkedPRUrl,
		};
	}
	if (appliedFor === null) return null;
	return { checkoutPullRequests: {}, checkoutPullRequestsFor: null };
}
