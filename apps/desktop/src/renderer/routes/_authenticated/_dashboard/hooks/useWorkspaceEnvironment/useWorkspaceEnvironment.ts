import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export interface WorkspaceEnvironment {
	id: string;
	name: string;
	sourceKind: string;
	scope: string;
	createdByUserId: string | null;
}

/** The cloud workspace's environment, when this user can open it: a teammate's personal environment is not listed. */
export function useWorkspaceEnvironment(
	workspaceId: string,
): WorkspaceEnvironment | null {
	const { workspaces, organizationId } = useCloudWorkspaces();
	const environmentId =
		workspaces?.find((workspace) => workspace.id === workspaceId)
			?.environmentId ?? null;
	const environments = cloudTrpc.environment.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: !!environmentId && !!organizationId },
	);
	const environment = environments.data?.find(
		(row) => row.id === environmentId,
	);
	return environment
		? {
				id: environment.id,
				name: environment.name,
				sourceKind: environment.sourceKind,
				scope: environment.scope,
				createdByUserId: environment.createdByUserId,
			}
		: null;
}
