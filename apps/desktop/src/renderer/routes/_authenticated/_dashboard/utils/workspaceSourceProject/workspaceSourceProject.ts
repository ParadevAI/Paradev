import {
	findHostProjectRow,
	type HostProjectItem,
	type HostProjectRow,
	type HostProjectRowsResult,
} from "renderer/hooks/host-projects/useHostProjects/useHostProjects.utils";

/**
 * The project as the host that owns the workspace knows it: repositories are
 * per host. The merged project is only a fallback, for a workspace no host lists.
 */
export function workspaceSourceProject({
	hostResults,
	projects,
	hostId,
	projectId,
}: {
	hostResults: HostProjectRowsResult[];
	projects: HostProjectItem[];
	hostId: string | null | undefined;
	projectId: string | null;
}): HostProjectRow | HostProjectItem | undefined {
	if (!projectId) return undefined;
	const hostRow = findHostProjectRow(hostResults, hostId, projectId);
	if (hostRow) return hostRow;
	return projects.find(
		(row) => row.projectKey === projectId || row.id === projectId,
	);
}
