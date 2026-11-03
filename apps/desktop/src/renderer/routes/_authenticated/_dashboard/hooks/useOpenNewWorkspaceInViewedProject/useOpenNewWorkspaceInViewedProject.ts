import { useMatchRoute } from "@tanstack/react-router";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

/** Opens the new-workspace screen with the viewed workspace's project and host already picked. */
export function useOpenNewWorkspaceInViewedProject(): () => void {
	const openNewWorkspace = useOpenNewWorkspace();
	const matchRoute = useMatchRoute();
	const { workspaces } = useHostWorkspaces();
	const match = matchRoute({ to: "/v2-workspace/$workspaceId", fuzzy: true });
	const viewed =
		match !== false
			? workspaces.find((workspace) => workspace.id === match.workspaceId)
			: undefined;
	return () => openNewWorkspace(viewed?.projectId, viewed?.hostId);
}
