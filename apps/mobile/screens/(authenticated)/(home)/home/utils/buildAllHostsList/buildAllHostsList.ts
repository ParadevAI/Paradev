import {
	isPlaceUnreachable,
	type PlaceStatus,
} from "@/screens/(authenticated)/(home)/utils/placeStatus";
import type { HomeListItem } from "../../types";

export interface AllHostsPlace {
	machineId: string;
	name: string;
	status: PlaceStatus;
	lastSeenAt?: number | null;
	items: HomeListItem[];
	/** Says why a place has no rows; a null label means it is still loading. */
	empty?: { label: string | null };
}

export const CLOUD_PLACE_ID = "cloud";

const withEmptyNote = (
	placeId: string,
	items: HomeListItem[],
	empty: { label: string | null } | undefined,
): HomeListItem[] =>
	items.length === 0 && empty
		? [{ kind: "placeEmpty", placeId, label: empty.label }]
		: items;

/**
 * Every place in one list, each under a flat label rather than a level of
 * its own: hosts that are or may be online by name, then Cloud, then hosts
 * that can't answer by name.
 */
export function buildAllHostsList({
	hosts,
	cloud,
}: {
	hosts: readonly AllHostsPlace[];
	/** Null where Cloud is not offered. */
	cloud: {
		name: string;
		items: HomeListItem[];
		empty?: { label: string | null };
	} | null;
}): HomeListItem[] {
	const byName = (a: AllHostsPlace, b: AllHostsPlace) =>
		a.name.localeCompare(b.name);
	const hostItems = (host: AllHostsPlace): HomeListItem[] => [
		{
			kind: "hostLabel",
			placeId: host.machineId,
			name: host.name,
			cloud: false,
			status: host.status,
			lastSeenAt: host.lastSeenAt,
		},
		...withEmptyNote(host.machineId, host.items, host.empty),
	];
	return [
		...hosts
			.filter((host) => !isPlaceUnreachable(host.status))
			.sort(byName)
			.flatMap(hostItems),
		...(cloud
			? [
					{
						kind: "hostLabel",
						placeId: CLOUD_PLACE_ID,
						name: cloud.name,
						cloud: true,
						status: "online",
					} satisfies HomeListItem,
					...withEmptyNote(CLOUD_PLACE_ID, cloud.items, cloud.empty),
				]
			: []),
		...hosts
			.filter((host) => isPlaceUnreachable(host.status))
			.sort(byName)
			.flatMap(hostItems),
	];
}
