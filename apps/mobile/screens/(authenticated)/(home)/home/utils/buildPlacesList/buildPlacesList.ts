import {
	isPlaceUnreachable,
	type PlaceStatus,
} from "@/screens/(authenticated)/(home)/utils/placeStatus";
import type { TerminalAttention } from "../../hooks/useHostTerminals/attention";
import type { HomeListItem } from "../../types";
import { strongestAttention } from "../strongestAttention";

interface PlaceContent {
	name: string;
	items: HomeListItem[];
	/** Says why a place has no rows; a null label means it is still loading. */
	empty?: { label: string | null };
	collapsed?: boolean;
	/** Each listed workspace's attention, for the count and a collapsed rollup. */
	attentions?: readonly (TerminalAttention | null | undefined)[];
}

export interface Place extends PlaceContent {
	machineId: string;
	status: PlaceStatus;
	lastSeenAt?: number | null;
}

export const CLOUD_PLACE_ID = "cloud";

/**
 * A place's header and what sits under it. A collapsed place hides its
 * rows and its empty note; its header carries their count and the most
 * urgent state among them.
 */
function placeItems(
	placeId: string,
	place: PlaceContent,
	header: { status: PlaceStatus; lastSeenAt?: number | null },
): HomeListItem[] {
	const attentions = place.attentions ?? [];
	const collapsed = place.collapsed ?? false;
	const label: HomeListItem = {
		kind: "placeLabel",
		placeId,
		name: place.name,
		...header,
		collapsible: true,
		collapsed,
		count: attentions.length,
		attention: collapsed ? strongestAttention(attentions) : null,
	};
	if (collapsed) return [label];
	if (place.items.length === 0 && place.empty) {
		return [label, { kind: "placeEmpty", placeId, label: place.empty.label }];
	}
	return [label, ...place.items];
}

/**
 * Every place in one list, each under a header rather than a level of
 * nesting: hosts that are or may be online by name, then Cloud, then hosts
 * that can't answer by name.
 */
export function buildPlacesList({
	hosts,
	cloud,
}: {
	hosts: readonly Place[];
	/** Null where Cloud is not offered. */
	cloud: PlaceContent | null;
}): HomeListItem[] {
	const byName = (a: Place, b: Place) => a.name.localeCompare(b.name);
	const hostItems = (host: Place) =>
		placeItems(host.machineId, host, {
			status: host.status,
			lastSeenAt: host.lastSeenAt,
		});
	const list: HomeListItem[] = [
		...hosts
			.filter((host) => !isPlaceUnreachable(host.status))
			.sort(byName)
			.flatMap(hostItems),
		...(cloud ? placeItems(CLOUD_PLACE_ID, cloud, { status: "online" }) : []),
		...hosts
			.filter((host) => isPlaceUnreachable(host.status))
			.sort(byName)
			.flatMap(hostItems),
	];
	const [head] = list;
	if (head?.kind === "placeLabel") list[0] = { ...head, first: true };
	return list;
}
