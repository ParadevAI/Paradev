import { PLACE_COLLAPSE_KEY } from "./prunePlaceKeys";

export function collapsedProjectKey(machineId: string, projectId: string) {
	return `${machineId}:${projectId}`;
}

export function isPlaceCollapsed(
	collapsed: Readonly<Record<string, true>>,
	placeId: string,
): boolean {
	return !!collapsed[collapsedProjectKey(placeId, PLACE_COLLAPSE_KEY)];
}
