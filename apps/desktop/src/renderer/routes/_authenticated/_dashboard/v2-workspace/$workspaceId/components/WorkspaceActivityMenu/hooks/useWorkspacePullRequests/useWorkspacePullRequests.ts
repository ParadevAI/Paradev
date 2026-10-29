import { workspaceTrpc } from "@superset/workspace-client";

const REFRESH_MS = 30_000;

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
	return query.data?.workspaces[0]?.pullRequests ?? [];
}
