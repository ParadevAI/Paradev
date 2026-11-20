import { isLiveCloudWorkspaceStatus } from "@superset/shared/cloud-workspace-status";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useIsOrganizationAdmin } from "renderer/hooks/useIsOrganizationAdmin";
import { authClient } from "renderer/lib/auth-client";
import { useWorkspaceEnvironment } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceEnvironment";

/**
 * The environment a cloud workspace can save a checkpoint to: null when the
 * caller can't change it for everyone. `isReady` is false until the box runs.
 */
export function useSaveCheckpoint(workspaceId: string) {
	const environment = useWorkspaceEnvironment(workspaceId);
	const { workspaces } = useCloudWorkspaces();
	const status = workspaces?.find((row) => row.id === workspaceId)?.status;
	const { data: session } = authClient.useSession();
	const isAdmin = useIsOrganizationAdmin() === true;
	const canSave =
		!!environment &&
		(environment.scope !== "organization" ||
			environment.createdByUserId === session?.user?.id ||
			isAdmin);
	return {
		environment: canSave ? environment : null,
		isReady: status !== undefined && isLiveCloudWorkspaceStatus(status),
	};
}
