export type MoveComputer = { hostId: string; name: string; online: boolean };

type Host = { machineId: string; name: string; isOnline: boolean };

/**
 * The computers a workspace on `fromHostId` can move to, online first. A cloud
 * workspace's box is in the roster too, but it is not a computer.
 */
export function listMoveComputers({
	hosts,
	fromHostId,
	cloudHostIds,
}: {
	hosts: Host[];
	fromHostId: string;
	cloudHostIds: ReadonlySet<string>;
}): MoveComputer[] {
	return hosts
		.filter(
			(host) =>
				host.machineId !== fromHostId && !cloudHostIds.has(host.machineId),
		)
		.map((host) => ({
			hostId: host.machineId,
			name: host.name,
			online: host.isOnline,
		}))
		.sort((a, b) => Number(b.online) - Number(a.online));
}
