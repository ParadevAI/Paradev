import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { WHERE_FILTER_ANYWHERE } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

/** The workspace behind an agent, from the board's rows and the host's, with its host's URL. */
export function useAgentWorkspace(workspaceId: string) {
	const { all, isReady } = useAccessibleV2Workspaces({
		whereFilter: WHERE_FILTER_ANYWHERE,
	});
	const { workspaces: hostRows, cache } = useHostWorkspaces();
	const workspace = all.find((candidate) => candidate.id === workspaceId);
	const hostRow = hostRows.find((row) => row.id === workspaceId);
	const hostUrl = workspace ? cache.resolveHostUrl(workspace.hostId) : null;
	return { workspace, hostRow, hostUrl, isReady };
}
