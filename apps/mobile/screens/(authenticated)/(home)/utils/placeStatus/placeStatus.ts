import type { HostPresenceStatus } from "@/hooks/useHostsPresence";

/**
 * What Home may say about a machine. Pending presence is not an answer, so
 * it is never "offline": its cached rows show as they are, or it loads.
 * "unknown" is presence that failed: Home can't check.
 */
export type PlaceStatus = "online" | "pending" | "offline" | "unknown";

export function placeStatus(
	isOnline: boolean,
	presence: HostPresenceStatus,
): PlaceStatus {
	if (isOnline) return "online";
	if (presence === "pending") return "pending";
	if (presence === "unavailable") return "unknown";
	return "offline";
}

/** Rows a place can show are shown dimmed, untappable, only when it can't answer. */
export function isPlaceUnreachable(status: PlaceStatus): boolean {
	return status === "offline" || status === "unknown";
}

export type PlaceEmptyState = "loading" | "failed" | "empty" | "nothingSaved";

export function placeEmptyState(
	status: PlaceStatus,
	workspaces: { isReady: boolean; failed: boolean },
): PlaceEmptyState {
	if (status === "pending") return "loading";
	if (isPlaceUnreachable(status)) return "nothingSaved";
	if (workspaces.failed) return "failed";
	return workspaces.isReady ? "empty" : "loading";
}
