import type {
	SavedWorkspaceScope,
	WorkspaceScope,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore/workspacesFilterStore";

/** More places than this and Home never queries them all at once. */
export const MAX_ALL_HOSTS_PLACES = 3;

/** All hosts is offered for two to three places, Cloud counted as one. */
export function isAllHostsOffered(
	hostCount: number,
	cloudEnabled: boolean,
): boolean {
	const places = hostCount + (cloudEnabled ? 1 : 0);
	return places >= 2 && places <= MAX_ALL_HOSTS_PLACES;
}

/**
 * The scope Home shows. An organization with no machine falls back to Cloud,
 * where Cloud is enabled: the host scope's empty state is setup steps for a
 * computer it may never have. Cloud is behind a flag, so a saved Cloud pick
 * reads as "host" for anyone the flag is off for.
 */
export function resolveWorkspaceScope({
	saved,
	hostCount,
	hostsAnswered,
	cloudEnabled,
}: {
	saved: SavedWorkspaceScope;
	hostCount: number;
	hostsAnswered: boolean;
	cloudEnabled: boolean;
}): WorkspaceScope {
	if (saved === "cloud" && cloudEnabled) return "cloud";
	const allOffered = isAllHostsOffered(hostCount, cloudEnabled);
	if ((saved === "all" || saved === null) && allOffered) return "all";
	// An empty list while the roster is pending is not an answer.
	if (cloudEnabled && hostsAnswered && hostCount === 0) return "cloud";
	return "host";
}
