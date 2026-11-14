import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { checkoutRepositoryFullNames } from "../../utils/repositorySet";
import { workspaceSourceProject } from "../../utils/workspaceSourceProject";

/** The GitHub `owner/name` of each of the workspace's checkouts; null while unknown or when one has none. */
export function useWorkspaceRepositoryFullNames(
	workspaceId: string,
	projectId: string | null,
): string[] | null {
	const { projects, hostResults } = useHostProjects();
	const { workspaces } = useHostWorkspaces();
	const workspace = workspaces.find((row) => row.id === workspaceId);
	const hostId = workspace?.hostId;
	const checkouts = workspace?.checkouts;
	return useMemo(() => {
		const project = workspaceSourceProject({
			hostResults,
			projects,
			hostId,
			projectId,
		});
		return project && checkouts
			? checkoutRepositoryFullNames(checkouts, project.repositories)
			: null;
	}, [hostResults, projects, hostId, projectId, checkouts]);
}
