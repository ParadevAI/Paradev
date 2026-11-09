import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export type MovableWorkspace = {
	id: string;
	hostId: string;
	projectId: string | null;
	name: string;
};

export type WorkspaceMoveDirection = "to-cloud" | "to-computer";

/**
 * A workspace on this computer moves to the cloud, and a cloud workspace
 * moves to this computer. Null when it can do neither.
 */
export function useWorkspaceMoveDirection(
	hostId: string,
	/** Known from a sidebar row; otherwise only the open cloud workspace is recognised. */
	isCloudWorkspace?: boolean,
): WorkspaceMoveDirection | null {
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const { machineId } = useLocalHostService();
	const { cache } = useHostWorkspaces();
	if (!cloudEnabled) return null;
	if (hostId === machineId) return "to-cloud";
	if (isCloudWorkspace ?? cache.isSandboxHost(hostId)) return "to-computer";
	return null;
}
