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

// A stack changes when someone acts on it, and our own actions invalidate it.
const STACK_STALE_MS = 5 * 60_000;

function isRateLimited(error: unknown): boolean {
	return /rate limit/i.test(error instanceof Error ? error.message : "");
}

export const PULL_REQUEST_STACK_QUERY_KEY_PREFIX = ["pull-request-stack"];

export function usePullRequestStack(
	target: PullRequestTarget | null,
): PullRequestStackQuery {
	const query = useQuery({
		queryKey: pullRequestStackQueryKey(target),
		queryFn: () => (target ? readPullRequestStack(target) : null),
		enabled: target !== null && canActOnPullRequest(target),
		staleTime: STACK_STALE_MS,
		gcTime: 10 * 60_000,
		refetchOnWindowFocus: false,
		retryOnMount: false,
		retry: (failures, error) => failures < 1 && !isRateLimited(error),
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
