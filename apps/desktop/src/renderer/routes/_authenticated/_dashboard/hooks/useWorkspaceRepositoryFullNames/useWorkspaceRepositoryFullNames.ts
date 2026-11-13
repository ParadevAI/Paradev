import { useMemo } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { checkoutRepositoryFullNames } from "../../utils/repositorySet";

/** The GitHub `owner/name` of each of the workspace's checkouts; null while unknown or when one has none. */
export function useWorkspaceRepositoryFullNames(
	workspaceId: string,
	projectId: string | null,
): string[] | null {
	const { projects } = useHostProjects();
	const { workspaces } = useHostWorkspaces();
	const project = projects.find(
		(row) => row.projectKey === projectId || row.id === projectId,
	);
	const checkouts = workspaces.find(
		(workspace) => workspace.id === workspaceId,
	)?.checkouts;
	return useMemo(
		() =>
			project && checkouts
				? checkoutRepositoryFullNames(checkouts, project.repositories)
				: null,
		[project, checkouts],
	);
}
