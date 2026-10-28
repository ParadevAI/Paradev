import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type PullRequestTarget,
	pullRequestThreadsQueryKey,
	replyToPullRequestThread,
	setPullRequestThreadResolution,
} from "../../utils/pullRequestClient";

/** Reply to and resolve review threads as the viewer; every surface reading the threads refetches after. */
export function useReviewThreadActions(target: PullRequestTarget | null) {
	const queryClient = useQueryClient();
	return useMemo(() => {
		const requireTarget = () => {
			if (!target) throw new Error("The pull request is not known yet");
			return target;
		};
		const refresh = () =>
			target
				? queryClient.invalidateQueries({
						queryKey: pullRequestThreadsQueryKey(target),
					})
				: Promise.resolve();
		return {
			reply: async (commentId: number, body: string) => {
				await replyToPullRequestThread(requireTarget(), { commentId, body });
				await refresh();
			},
			setResolved: async (threadId: string, resolved: boolean) => {
				await setPullRequestThreadResolution(requireTarget(), {
					threadId,
					resolved,
				});
				await refresh();
			},
			/** Resolves every thread, then reads the list once rather than once per thread. */
			resolveAll: async (threadIds: readonly string[]) => {
				const pullRequest = requireTarget();
				const results = await Promise.allSettled(
					threadIds.map((threadId) =>
						setPullRequestThreadResolution(pullRequest, {
							threadId,
							resolved: true,
						}),
					),
				);
				if (results.some((result) => result.status === "fulfilled")) {
					await refresh();
				}
				return results;
			},
		};
	}, [target, queryClient]);
}
