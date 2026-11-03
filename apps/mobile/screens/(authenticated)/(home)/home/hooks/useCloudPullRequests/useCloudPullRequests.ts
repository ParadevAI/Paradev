import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type CloudPullRequest =
	RouterOutputs["cloudWorkspace"]["pullRequests"][number];

function usePullRequestsQuery(
	organizationId: string | null,
	archived: boolean,
	enabled: boolean,
) {
	return useQuery({
		queryKey: [
			"cloud",
			"cloudWorkspace",
			"pullRequests",
			organizationId,
			archived,
		],
		enabled: enabled && organizationId !== null,
		staleTime: 30_000,
		queryFn: () =>
			apiClient.cloudWorkspace.pullRequests.query({
				organizationId: organizationId as string,
				archived,
			}),
	});
}

/**
 * Desktop's useCloudPullRequests: every pull request each cloud workspace's
 * box linked, read from the API rather than from the sandbox, so a list of
 * them wakes nothing. The pull_requests nudge refetches it.
 */
export function useCloudPullRequests({
	active,
	archived,
}: {
	active: boolean;
	archived: boolean;
}): ReadonlyMap<string, CloudPullRequest[]> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const activeQuery = usePullRequestsQuery(organizationId, false, active);
	const archivedQuery = usePullRequestsQuery(organizationId, true, archived);

	return useMemo(() => {
		const byWorkspace = new Map<string, CloudPullRequest[]>();
		for (const pullRequest of [
			...(activeQuery.data ?? []),
			...(archivedQuery.data ?? []),
		]) {
			const rows = byWorkspace.get(pullRequest.cloudWorkspaceId);
			if (rows) rows.push(pullRequest);
			else byWorkspace.set(pullRequest.cloudWorkspaceId, [pullRequest]);
		}
		return byWorkspace;
	}, [activeQuery.data, archivedQuery.data]);
}
