import {
	listMoveDestinationComputers,
	type MoveDestinationComputer,
} from "@superset/shared/move-book";
import { useMemo } from "react";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export function useMoveDestinationComputers(
	fromHostId: string,
): MoveDestinationComputer[] {
	const { machineId } = useLocalHostService();
	const { hosts } = useKnownHosts();
	const { workspaces: cloudWorkspaces = [] } = useCloudWorkspaces();

	return useMemo(
		() =>
			listMoveDestinationComputers({
				hosts,
				fromHostId,
				thisHostId: machineId ?? null,
				cloudHostIds: new Set(cloudWorkspaces.map((row) => row.id)),
			}),
		[hosts, fromHostId, cloudWorkspaces, machineId],
	);
}
