import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export type MovableWorkspace = {
	id: string;
	hostId: string;
	projectId: string | null;
	name: string;
};

export type WorkspaceMoveDirection = "to-cloud" | "to-computer";

export function useWorkspaceMoveDirections(
	hostId: string,
): WorkspaceMoveDirection[] {
	const cloudEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const movesEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.WORKSPACE_MOVES);
	const { machineId } = useLocalHostService();
	const { workspaces: cloudWorkspaces = [] } = useCloudWorkspaces();
	const organizationId = useActiveOrganizationId();
	const roster = cloudTrpc.host.roster.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: !!organizationId && movesEnabled === true },
	);
	if (!movesEnabled) return [];
	const directions: WorkspaceMoveDirection[] = [];
	const isLocal = hostId === machineId;
	const computers = (roster.data ?? []).filter(
		(host) => !cloudWorkspaces.some((row) => row.id === host.machineId),
	);
	const onOwnComputer =
		isLocal || computers.some((host) => host.machineId === hostId);
	if (onOwnComputer && cloudEnabled) directions.push("to-cloud");
	const hasOtherComputer = computers.some((host) => host.machineId !== hostId);
	if (!isLocal || hasOtherComputer) {
		directions.push("to-computer");
	}
	return directions;
}
