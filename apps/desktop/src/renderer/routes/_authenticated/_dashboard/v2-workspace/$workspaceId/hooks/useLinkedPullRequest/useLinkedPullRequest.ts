import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import type { PullRequestTarget } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestClient";

/**
 * The pull request the host links to this workspace, from the host's own
 * records, and that pull request as a target the viewer acts on. Pass
 * `enabled: false` to read whatever another observer already fetched.
 */
export function useLinkedPullRequest(
	workspaceId: string,
	{ enabled = true }: { enabled?: boolean } = {},
) {
	const organizationId = useActiveOrganizationId();
	const query = workspaceTrpc.git.getPullRequest.useQuery(
		{ workspaceId },
		{
			enabled: !!workspaceId && enabled,
			refetchInterval: 10_000,
			refetchOnWindowFocus: true,
			staleTime: 10_000,
		},
	);
	const ref = query.data?.url ? pullRequestRefFromUrl(query.data.url) : null;
	const repoFullName = ref?.repoFullName ?? null;
	const prNumber = ref?.number ?? null;
	const target = useMemo<PullRequestTarget | null>(
		() =>
			repoFullName && prNumber !== null
				? { organizationId, repoFullName, prNumber }
				: null,
		[organizationId, repoFullName, prNumber],
	);
	return { query, target };
}
