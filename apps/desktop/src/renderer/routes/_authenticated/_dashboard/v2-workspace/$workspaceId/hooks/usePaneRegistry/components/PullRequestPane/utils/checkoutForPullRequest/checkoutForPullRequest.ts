import {
	isSamePullRequest,
	type PullRequestRef,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";

/** The checkout whose linked pull request is `pullRequest`, if any. */
export function checkoutForPullRequest(
	checkouts: Array<{ id: string; pullRequestUrl: string | null | undefined }>,
	pullRequest: PullRequestRef,
): string | null {
	for (const checkout of checkouts) {
		const ref = checkout.pullRequestUrl
			? pullRequestRefFromUrl(checkout.pullRequestUrl)
			: null;
		if (ref && isSamePullRequest(ref, pullRequest)) return checkout.id;
	}
	return null;
}
