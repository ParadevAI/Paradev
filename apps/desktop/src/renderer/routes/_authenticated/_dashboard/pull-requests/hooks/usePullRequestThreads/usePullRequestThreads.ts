import { useQuery } from "@tanstack/react-query";
import {
	canActOnPullRequest,
	type PullRequestTarget,
	pullRequestThreadsQueryKey,
	readPullRequestThreads,
} from "../../utils/pullRequestClient";

/** The pull request's review threads, polled so a reply made elsewhere shows within the half minute. */
export function usePullRequestThreads(
	target: PullRequestTarget | null,
	options: { enabled?: boolean } = {},
) {
	return useQuery({
		queryKey: target
			? pullRequestThreadsQueryKey(target)
			: ["pull-request-threads", null],
		queryFn: () => {
			if (!target) throw new Error("The pull request is not known yet");
			return readPullRequestThreads(target);
		},
		enabled:
			(options.enabled ?? true) &&
			target !== null &&
			canActOnPullRequest(target),
		staleTime: 30_000,
		gcTime: 10 * 60_000,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
	});
}
