import type { HomeListItem } from "../../types";

export interface AllHostsPlace {
	machineId: string;
	name: string;
	online: boolean;
	lastSeenAt?: number | null;
	items: HomeListItem[];
}

export const CLOUD_PLACE_ID = "cloud";

/**
 * Every place in one list, each under a flat label rather than a level of
 * its own: online hosts by name, then Cloud, then offline hosts by name.
 */
export function buildAllHostsList({
	hosts,
	cloud,
}: {
	hosts: readonly AllHostsPlace[];
	/** Null where Cloud is not offered. */
	cloud: { name: string; items: HomeListItem[] } | null;
}): HomeListItem[] {
	const byName = (a: AllHostsPlace, b: AllHostsPlace) =>
		a.name.localeCompare(b.name);
	const hostItems = (host: AllHostsPlace): HomeListItem[] => [
		{
			kind: "hostLabel",
			placeId: host.machineId,
			name: host.name,
			cloud: false,
			online: host.online,
			lastSeenAt: host.lastSeenAt,
		},
		...host.items,
	];
	return [
		...hosts
			.filter((host) => host.online)
			.sort(byName)
			.flatMap(hostItems),
		...(cloud
			? [
					{
						kind: "hostLabel",
						placeId: CLOUD_PLACE_ID,
						name: cloud.name,
						cloud: true,
						online: true,
					} satisfies HomeListItem,
					...cloud.items,
				]
			: []),
		...hosts
			.filter((host) => !host.online)
			.sort(byName)
			.flatMap(hostItems),
	];
}
