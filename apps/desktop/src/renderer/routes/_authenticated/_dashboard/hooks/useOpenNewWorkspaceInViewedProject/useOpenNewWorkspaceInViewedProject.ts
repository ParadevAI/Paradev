import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { useMatchRoute } from "@tanstack/react-router";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { cloudRepoProjectId } from "renderer/lib/github/cloudRepoProjectId";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useCloudWorkspaceRepositories } from "../useCloudWorkspaceRepositories";

interface ViewedWorkspaceHandoff {
	projectId?: string;
	hostId?: string;
	repository?: string;
}

/**
 * A cloud workspace hands off its repository: the project id its sandbox
 * reports exists only inside that sandbox, and its host id is the workspace's.
 */
export function resolveViewedWorkspaceHandoff({
	workspaceId,
	viewed,
	isCloudWorkspace,
	primaryRepositoryById,
}: {
	workspaceId: string | null;
	viewed: { projectId: string | null; hostId: string } | undefined;
	isCloudWorkspace: (id: string) => boolean;
	primaryRepositoryById: ReadonlyMap<string, string>;
}): ViewedWorkspaceHandoff {
	if (!workspaceId) return {};
	const cloudWorkspaceId = isCloudWorkspace(workspaceId)
		? workspaceId
		: viewed && isCloudWorkspace(viewed.hostId)
			? viewed.hostId
			: null;
	if (cloudWorkspaceId) {
		const repository = primaryRepositoryById.get(cloudWorkspaceId);
		return repository
			? {
					projectId: cloudRepoProjectId(repository),
					hostId: CLOUD_HOST_ID,
					repository,
				}
			: { hostId: CLOUD_HOST_ID };
	}
	if (!viewed) return {};
	return { projectId: viewed.projectId ?? undefined, hostId: viewed.hostId };
}

/** Opens the new-workspace screen with the viewed workspace's project and host already picked. */
export function useOpenNewWorkspaceInViewedProject(): () => void {
	const openNewWorkspace = useOpenNewWorkspace();
	const matchRoute = useMatchRoute();
	const organizationId = useActiveOrganizationId();
	const { workspaces, cache } = useHostWorkspaces();
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const match = matchRoute({ to: "/v2-workspace/$workspaceId", fuzzy: true });
	const workspaceId = match !== false ? match.workspaceId : null;
	const { primaryRepositoryById } = useCloudWorkspaceRepositories({
		organizationId,
		enabled: workspaceId !== null,
	});
	return () => {
		const handoff = resolveViewedWorkspaceHandoff({
			workspaceId,
			viewed: workspaces.find((workspace) => workspace.id === workspaceId),
			isCloudWorkspace: (id) =>
				cache.isSandboxHost(id) ||
				(cloudWorkspaces ?? []).some((workspace) => workspace.id === id),
			primaryRepositoryById,
		});
		openNewWorkspace(handoff.projectId, handoff.hostId, handoff.repository);
	};
}
