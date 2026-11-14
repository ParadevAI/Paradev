export type MoveDestinationComputer = {
	hostId: string;
	name: string | null;
	online: boolean;
	isThisComputer: boolean;
};

type Host = { machineId: string; name: string; isOnline: boolean };

/**
 * The computers a workspace on `fromHostId` can move to: this computer first,
 * then the others, online before offline. Cloud boxes are not computers.
 */
export function listMoveDestinationComputers({
	hosts,
	fromHostId,
	thisHostId,
	cloudHostIds,
}: {
	hosts: Host[];
	fromHostId: string;
	thisHostId: string | null;
	cloudHostIds: ReadonlySet<string>;
}): MoveDestinationComputer[] {
	const others = hosts
		.filter(
			(host) =>
				host.machineId !== fromHostId &&
				host.machineId !== thisHostId &&
				!cloudHostIds.has(host.machineId),
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
	if (!thisHostId || thisHostId === fromHostId) return others;
	return [
		{
			hostId: thisHostId,
			name: hosts.find((host) => host.machineId === thisHostId)?.name ?? null,
			online: true,
			isThisComputer: true,
		},
		...others,
	];
}
