import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
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
 * Where a workspace can move: one on this computer to the cloud, and any
 * workspace to a computer other than its own. Empty when it can move nowhere.
 */
export function useWorkspaceMoveDirections(
	hostId: string,
): WorkspaceMoveDirection[] {
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const movesEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.WORKSPACE_MOVES);
	const { machineId } = useLocalHostService();
	const { cache } = useHostWorkspaces();
	const organizationId = useActiveOrganizationId();
	const roster = cloudTrpc.host.roster.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: !!organizationId && movesEnabled === true },
	);
	if (!movesEnabled) return [];
	const directions: WorkspaceMoveDirection[] = [];
	const isLocal = hostId === machineId;
	if (isLocal && cloudEnabled) directions.push("to-cloud");
	const hasOtherComputer = (roster.data ?? []).some(
		(host) => host.machineId !== hostId && !cache.isSandboxHost(host.machineId),
	);
	if (!isLocal || hasOtherComputer) {
		directions.push("to-computer");
	}
	return directions;
}
