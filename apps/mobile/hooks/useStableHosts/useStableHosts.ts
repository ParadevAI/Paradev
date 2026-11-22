import { useMemo } from "react";

interface StableHost {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

/**
 * The same array while no host joins, leaves or changes presence, so query
 * lists and `combine` callbacks built from it keep their identity.
 */
export function useStableHosts<H extends StableHost>(
	hosts: readonly H[],
): readonly H[] {
	const hostsKey = hosts
		.map((host) => `${host.organizationId}:${host.machineId}:${host.isOnline}`)
		.join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: hostsKey stands for `hosts`
	return useMemo(() => hosts, [hostsKey]);
}
