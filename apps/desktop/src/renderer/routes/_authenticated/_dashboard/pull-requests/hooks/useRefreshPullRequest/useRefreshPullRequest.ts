import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import {
	type PullRequestTarget,
	pullRequestDiffQueryKey,
	pullRequestThreadsQueryKey,
} from "../../utils/pullRequestClient";
import { pullRequestDetailQueryKey } from "../usePullRequestDetail";

interface RefreshPullRequestInput {
	target: PullRequestTarget | null;
	/** The PR's own URL; the Code tab keys its diff on the repository in it. */
	url: string | null | undefined;
}

export function useRefreshPullRequest({
	target,
	url,
}: RefreshPullRequestInput) {
	const queryClient = useQueryClient();
	const detailKey = pullRequestDetailQueryKey(
		target?.repoFullName ?? null,
		target?.prNumber ?? null,
	);
	const isRefreshing = useIsFetching({ queryKey: detailKey }) > 0;

	const refresh = () => {
		void queryClient.invalidateQueries({ queryKey: detailKey });
		if (!target) return;
		const codeTabTarget = {
			...target,
			repoFullName:
				(url ? pullRequestRefFromUrl(url)?.repoFullName : null) ??
				target.repoFullName,
		};
		void queryClient.invalidateQueries({
			queryKey: pullRequestDiffQueryKey(codeTabTarget),
		});
		void queryClient.invalidateQueries({
			queryKey: pullRequestThreadsQueryKey(codeTabTarget),
		});
		void queryClient.invalidateQueries({
			queryKey: [["git", "getPullRequest"]],
		});
	};

	return { refresh, isRefreshing };
}
