import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";

export function usePullRequestCounts(ref: PullRequestRef) {
	const { data } = usePullRequestDetail({
		projectId: null,
		repoFullName: ref.repoFullName,
		prNumber: ref.number,
	});
	return { additions: data?.additions, deletions: data?.deletions };
}
