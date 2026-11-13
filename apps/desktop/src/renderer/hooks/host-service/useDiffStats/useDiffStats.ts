import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { sumCheckoutDiffStats } from "renderer/routes/_authenticated/_dashboard/utils/workspaceCheckoutSummaries";
import { useWorkspaceEvent } from "../useWorkspaceEvent";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

export interface DiffStats {
	additions: number;
	deletions: number;
}

export function getDiffStatsQueryKey(
	hostUrl: string | null,
	workspaceId: string,
) {
	return ["diff-stats", "checkouts", hostUrl, workspaceId] as const;
}

export function useDiffStats(
	workspaceId: string,
	options?: { enabled?: boolean },
): DiffStats | null {
	const enabled = options?.enabled ?? true;
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() => getDiffStatsQueryKey(hostUrl, workspaceId),
		[hostUrl, workspaceId],
	);

	const { data } = useQuery({
		queryKey,
		enabled: enabled && Boolean(workspaceId) && Boolean(hostUrl),
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(
				hostUrl,
			).git.getDiffStatsByWorkspaces.query({
				workspaceIds: [workspaceId],
			});
		},
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey });
	}, [queryClient, queryKey]);

	// Stays subscribed while disabled: invalidation marks the cached stats
	// stale so they refetch when the query is re-enabled (staleTime is
	// Infinity, so a gated subscription would freeze counts).
	useWorkspaceEvent(
		"git:changed",
		workspaceId,
		invalidate,
		Boolean(workspaceId) && Boolean(hostUrl),
	);

	return useMemo<DiffStats | null>(() => {
		const checkouts = data?.workspaces.find(
			(row) => row.workspaceId === workspaceId,
		)?.checkouts;
		if (!checkouts) return null;
		const { additions, deletions } = sumCheckoutDiffStats(checkouts);
		return { additions, deletions };
	}, [data, workspaceId]);
}
