import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import { usePullRequestCounts } from "../../../../hooks/usePullRequestCounts";

export function PullRequestCountsPrefetch({
	pullRequest,
}: {
	pullRequest: PullRequestRef;
}) {
	usePullRequestCounts(pullRequest);
	return null;
}
