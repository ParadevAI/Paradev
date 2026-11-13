import { workspaceTrpc } from "@superset/workspace-client";
import { useMemo } from "react";
import { flattenCheckoutPullRequests } from "../../../../utils/flattenCheckoutPullRequests";

const REFRESH_MS = 30_000;

/** Every pull request the workspace linked, each tagged with its checkout's repository. */
export function useWorkspacePullRequests(
	workspaceId: string,
	{ enabled }: { enabled: boolean },
) {
	const query = workspaceTrpc.pullRequests.historyByWorkspaces.useQuery(
		{ workspaceIds: [workspaceId] },
		{
			enabled,
			refetchInterval: enabled ? REFRESH_MS : false,
			staleTime: 10_000,
		},
	);
	const checkouts = query.data?.workspaces[0]?.checkouts;
	return useMemo(() => flattenCheckoutPullRequests(checkouts), [checkouts]);
}
