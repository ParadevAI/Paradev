import { useQuery } from "@tanstack/react-query";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { LinkedPR } from "renderer/stores/new-workspace-draft";
import { findRepositoryPullRequests } from "./utils/findRepositoryPullRequests";

/** For a multi-repo project: which repository holds the linked PR, and the matching PRs in the others. */
export function useRepositoryPullRequests({
	projectId,
	hostId,
	linkedPR,
	enabled,
}: {
	projectId: string | null;
	hostId: string | null;
	linkedPR: LinkedPR | null;
	enabled: boolean;
}) {
	const hostUrl = useHostUrl(hostId);
	return useQuery({
		queryKey: [
			"new-workspace",
			"repository-pull-requests",
			hostUrl,
			projectId,
			linkedPR?.url,
		],
		enabled: enabled && !!hostUrl && !!projectId && !!linkedPR,
		staleTime: 60_000,
		retry: false,
		queryFn: () => {
			const client = getHostServiceClientByUrl(hostUrl as string);
			return findRepositoryPullRequests(
				(query) =>
					client.workspaceCreation.searchPullRequests.query({
						projectId: projectId as string,
						query,
						limit: 30,
					}),
				linkedPR as LinkedPR,
			);
		},
	});
}
