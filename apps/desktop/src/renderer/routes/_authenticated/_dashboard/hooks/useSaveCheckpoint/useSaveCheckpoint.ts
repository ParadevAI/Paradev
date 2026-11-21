import { isLiveCloudWorkspaceStatus } from "@superset/shared/cloud-workspace-status";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useWorkspaceEnvironment } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceEnvironment";
import { useCanChangeEnvironment } from "renderer/routes/_authenticated/hooks/useCanChangeEnvironment";

/**
 * The environment a cloud workspace can save a checkpoint to: null when the
 * caller can't change it for everyone. `isReady` is false until the box runs.
 */
export function useSaveCheckpoint(workspaceId: string) {
	const environment = useWorkspaceEnvironment(workspaceId);
	const { workspaces } = useCloudWorkspaces();
	const status = workspaces?.find((row) => row.id === workspaceId)?.status;
	const canSave = useCanChangeEnvironment(environment);
	return {
		environment: canSave ? environment : null,
		isReady: status !== undefined && isLiveCloudWorkspaceStatus(status),
	};
}
