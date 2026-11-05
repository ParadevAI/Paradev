import { expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { pullRequestThreadsQueryKey } from "../../utils/pullRequestClient";
import { useReviewThreadActions } from "./useReviewThreadActions";

const target = {
	organizationId: "org",
	repoFullName: "acme/widgets",
	prNumber: 7,
};

test("resolve all writes every thread, then reads the list once", async () => {
	const queryClient = new QueryClient();
	const invalidate = mock(() => Promise.resolve());
	queryClient.invalidateQueries = invalidate as never;
	const setPullRequestThreadResolution = mock(async () => {});
	const { result } = renderHook(
		() =>
			useReviewThreadActions(target, {
				replyToPullRequestThread: async () => {},
				setPullRequestThreadResolution,
			}),
		{
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={queryClient}>
					{children}
				</QueryClientProvider>
			),
		},
	);

	await result.current.resolveAll(["t1", "t2", "t3"]);

	expect(setPullRequestThreadResolution).toHaveBeenCalledTimes(3);
	expect(invalidate).toHaveBeenCalledTimes(1);
	expect(invalidate).toHaveBeenCalledWith({
		queryKey: pullRequestThreadsQueryKey(target),
	});
});
