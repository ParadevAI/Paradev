import type {
	PullRequestStack,
	PullRequestStackLayer,
} from "@superset/shared/pull-request-stack";
import { useQuery } from "@tanstack/react-query";
import {
	canActOnPullRequest,
	needsGithubConnection,
	type PullRequestTarget,
	pullRequestStackQueryKey,
	readPullRequestStack,
} from "../../utils/pullRequestClient";

export type { PullRequestStack, PullRequestStackLayer };

export interface PullRequestStackQuery {
	stack: PullRequestStack | null;
	isLoading: boolean;
	/** The stack read failed: the PR may be a layer of a stack nobody can see. */
	isIncomplete: boolean;
	refetch: () => void;
}

export const PULL_REQUEST_STACK_QUERY_KEY_PREFIX = ["pull-request-stack"];

export function usePullRequestStack(
	target: PullRequestTarget | null,
): PullRequestStackQuery {
	const query = useQuery({
		queryKey: pullRequestStackQueryKey(target),
		queryFn: () => (target ? readPullRequestStack(target) : null),
		enabled: target !== null && canActOnPullRequest(target),
		staleTime: 30_000,
		gcTime: 10 * 60_000,
		retry: 1,
	});
	return {
		stack: query.data ?? null,
		isLoading: query.isLoading,
		// Without a GitHub login there is nothing to merge with either, and the
		// pane already asks to connect.
		isIncomplete: query.isError && !needsGithubConnection(query.error),
		refetch: () => void query.refetch(),
	};
}
