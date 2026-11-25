import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

export function useWorkspaceName(workspaceId: string): string | undefined {
	const { workspaces } = useHostWorkspaces();
	return workspaces.find(({ id }) => id === workspaceId)?.name;
}
