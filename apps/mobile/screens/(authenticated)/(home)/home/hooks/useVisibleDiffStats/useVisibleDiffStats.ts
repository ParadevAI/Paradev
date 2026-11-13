import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { checkoutTargets } from "@/lib/host-service/checkouts";
import {
	type GitStatusSnapshot,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";
import {
	type DiffStats,
	diffStatsQueryKey,
	sumDiffStats,
} from "./utils/sumDiffStats";

export type { DiffStats } from "./utils/sumDiffStats";

const DIFF_STATS_STALE_MS = 60_000;
const DIFF_STATS_GC_MS = 30 * 60_000;

/**
 * Live working-tree diff stats. Summed across a workspace's checkouts, one
 * `git.getStatus` each. Fetching is viewport-bounded (only settled
 * visible rows subscribe — one screenful, not the whole project), but the
 * returned map is built from the whole query cache so rows scrolling back
 * into view render their last-known stats instead of flickering in.
 */
export function useVisibleDiffStats({
	visibleIds,
	workspacesById,
	resolveHostUrl,
}: {
	visibleIds: string[];
	workspacesById: Map<string, HostWorkspaceItem>;
	resolveHostUrl: (hostId: string) => string | null;
}): Map<string, DiffStats> {
	const queryClient = useQueryClient();

	const eligible = useMemo(() => {
		const result: Array<{
			workspaceId: string;
			hostUrl: string;
			repositoryId: string | null;
		}> = [];
		for (const workspaceId of visibleIds) {
			const workspace = workspacesById.get(workspaceId);
			if (
				!workspace ||
				!workspace.hostReachable ||
				workspace.worktreeExists === false
			) {
				continue;
			}
			const hostUrl = resolveHostUrl(workspace.hostId);
			if (!hostUrl) continue;
			for (const { repositoryId } of checkoutTargets(workspace)) {
				result.push({ workspaceId, hostUrl, repositoryId });
			}
		}
		return result;
	}, [visibleIds, workspacesById, resolveHostUrl]);

	const queries = useQueries({
		queries: eligible.map(({ workspaceId, hostUrl, repositoryId }) => ({
			queryKey: diffStatsQueryKey(hostUrl, workspaceId, repositoryId),
			staleTime: DIFF_STATS_STALE_MS,
			gcTime: DIFF_STATS_GC_MS,
			retry: 1,
			networkMode: "always" as const,
			queryFn: () =>
				getHostServiceClientByUrl(hostUrl).git.getStatus.query({
					workspaceId,
					repositoryId: repositoryId ?? undefined,
					priority: "background",
				}),
		})),
	});
	const dataVersion = queries.map((query) => query.dataUpdatedAt).join(",");

	// biome-ignore lint/correctness/useExhaustiveDependencies: dataVersion re-reads the cache when any visible query lands.
	return useMemo(
		() =>
			sumDiffStats({
				cached: queryClient.getQueriesData<GitStatusSnapshot>({
					queryKey: ["diff-stats"],
				}),
				workspacesById,
				resolveHostUrl,
			}),
		[queryClient, dataVersion, workspacesById, resolveHostUrl],
	);
}
