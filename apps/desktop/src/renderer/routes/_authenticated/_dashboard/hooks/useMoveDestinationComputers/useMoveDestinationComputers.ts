import { useMemo } from "react";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export type MoveDestinationComputer = {
	hostId: string;
	name: string | null;
	online: boolean;
	isThisComputer: boolean;
};

/**
 * The computers a workspace on `fromHostId` can move to: this computer first,
 * then the others, online before offline. Cloud boxes are not computers.
 */
export function useMoveDestinationComputers(
	fromHostId: string,
): MoveDestinationComputer[] {
	const { machineId } = useLocalHostService();
	const { hosts } = useKnownHosts();
	const { workspaces: cloudWorkspaces = [] } = useCloudWorkspaces();

	return useMemo(() => {
		const others = hosts
			.filter(
				(host) =>
					host.machineId !== fromHostId &&
					host.machineId !== machineId &&
					!cloudWorkspaces.some((row) => row.id === host.machineId),
			)
			.map(
				(host): MoveDestinationComputer => ({
					hostId: host.machineId,
					name: host.name,
					online: host.isOnline,
					isThisComputer: false,
				}),
			)
			.sort((a, b) => Number(b.online) - Number(a.online));
		const thisComputer: MoveDestinationComputer[] =
			machineId && machineId !== fromHostId
				? [
						{
							hostId: machineId,
							name:
								hosts.find((host) => host.machineId === machineId)?.name ??
								null,
							online: true,
							isThisComputer: true,
						},
					]
				: [];
		return [...thisComputer, ...others];
	}, [hosts, fromHostId, cloudWorkspaces, machineId]);
}
