import type { HomeListItem } from "../../types";

export interface AllHostsPlace {
	machineId: string;
	name: string;
	online: boolean;
	lastSeenAt?: number | null;
	items: HomeListItem[];
	/** Says why a place has no rows; unset while that is not known yet. */
	emptyLabel?: string;
}

export const CLOUD_PLACE_ID = "cloud";

const withEmptyNote = (
	placeId: string,
	items: HomeListItem[],
	emptyLabel: string | undefined,
): HomeListItem[] =>
	items.length === 0 && emptyLabel
		? [{ kind: "placeEmpty", placeId, label: emptyLabel }]
		: items;

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
	cloud: { name: string; items: HomeListItem[]; emptyLabel?: string } | null;
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
		...withEmptyNote(host.machineId, host.items, host.emptyLabel),
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
					...withEmptyNote(CLOUD_PLACE_ID, cloud.items, cloud.emptyLabel),
				]
			: []),
		...hosts
			.filter((host) => !host.online)
			.sort(byName)
			.flatMap(hostItems),
	];
}
