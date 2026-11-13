import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import {
	flattenPullRequestHistory,
	type WorkspacePullRequest,
} from "@/lib/host-service/pullRequestHistory";

export type { WorkspacePullRequest } from "@/lib/host-service/pullRequestHistory";

const HISTORY_REFETCH_MS = 60_000;

export function getWorkspacePullRequestsQueryKey(workspaceId: string | null) {
	return ["workspace-pull-request-history", workspaceId] as const;
}

/**
 * Every pull request this workspace has ever been linked to, in every
 * checkout, straight from the host's append-only history — current ones
 * first, then newest link first. The host is the thing that watches the
 * branches, so this needs no cloud GitHub integration and no branch
 * reconstruction.
 */
export function useWorkspacePullRequests(
	workspaceId: string | null,
): WorkspacePullRequest[] {
	const { workspace, host } = useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;

	const query = useQuery({
		queryKey: getWorkspacePullRequestsQueryKey(workspaceId),
		enabled: hostUrl !== null && workspaceId !== null,
		refetchInterval: HISTORY_REFETCH_MS,
		staleTime: 30_000,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl || !workspaceId) return null;
			const result = await getHostServiceClientByUrl(
				hostUrl,
			).pullRequests.historyByWorkspaces.query({
				workspaceIds: [workspaceId],
			});
			return result.workspaces[0] ?? null;
		},
	});

	const checkoutsKey = JSON.stringify(
		(workspace?.checkouts ?? []).map(({ repositoryId, name, isPrimary }) => ({
			repositoryId,
			name,
			isPrimary,
		})),
	);
	return useMemo(
		() =>
			flattenPullRequestHistory(
				query.data ?? undefined,
				JSON.parse(checkoutsKey),
			),
		[query.data, checkoutsKey],
	);
}

/**
 * The currently linked pull request only: the primary checkout's when it has
 * one, else the first other checkout's. Surfaces with room for one PR (Files
 * Changed's share/open actions) must never point at a historical PR from a
 * branch the workspace has moved past.
 */
export function useWorkspacePullRequest(
	workspaceId: string | null,
): WorkspacePullRequest | null {
	return (
		useWorkspacePullRequests(workspaceId).find((entry) => entry.isCurrent) ??
		null
	);
}
