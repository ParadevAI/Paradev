import type { AppRouter as HostServiceAppRouter } from "@superset/host-service";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type PullRequestStack = NonNullable<
	inferRouterOutputs<HostServiceAppRouter>["pullRequests"]["getStack"]
>;
export type PullRequestStackLayer = PullRequestStack["layers"][number];

export interface PullRequestStackQuery {
	stack: PullRequestStack | null;
	isLoading: boolean;
	/** The stack read failed: the PR may be a layer of a stack nobody can see. */
	isIncomplete: boolean;
	refetch: () => void;
	/** Where the stack was read; a stack merge must go to the same place. */
	projectId: string | null;
	hostUrl: string | null;
}

export const PULL_REQUEST_STACK_QUERY_KEY_PREFIX = ["pull-request-stack"];

export function usePullRequestStack({
	projectId,
	hostUrl,
	prNumber,
}: {
	projectId: string | null;
	hostUrl: string | null;
	prNumber: number | null;
}): PullRequestStackQuery {
	const query = useQuery({
		queryKey: [
			...PULL_REQUEST_STACK_QUERY_KEY_PREFIX,
			projectId,
			hostUrl,
			prNumber,
		],
		queryFn: async () => {
			if (!projectId || !hostUrl || prNumber === null) return null;
			try {
				return await getHostServiceClientByUrl(
					hostUrl,
				).pullRequests.getStack.query({ projectId, prNumber });
			} catch (error) {
				// A host older than the stack read has no stacks to show.
				if (isMissingProcedureError(error)) return null;
				throw error;
			}
		},
		enabled: !!projectId && !!hostUrl && prNumber !== null,
		staleTime: 30_000,
		gcTime: 10 * 60_000,
		retry: 1,
	});
	return {
		stack: query.data ?? null,
		isLoading: query.isLoading,
		isIncomplete: query.isError,
		refetch: () => void query.refetch(),
		projectId,
		hostUrl,
	};
}
