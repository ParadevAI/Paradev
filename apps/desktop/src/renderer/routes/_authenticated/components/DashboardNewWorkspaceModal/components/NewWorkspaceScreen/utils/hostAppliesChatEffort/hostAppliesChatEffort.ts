import { hostLaunchesChatWithEffort } from "@superset/shared/host-version";
import semver from "semver";

/**
 * Whether the host serving this launch starts a chat on its effort. A host on
 * this app's own build always does, released or not; an older one, such as a
 * local host adopted from another app instance, must meet the floor.
 */
export function hostAppliesChatEffort(
	hostVersion: string | null | undefined,
	appVersion: string,
): boolean {
	const host = semver.coerce(hostVersion ?? "");
	const app = semver.coerce(appVersion);
	if (host && app && semver.eq(host, app)) return true;
	return hostLaunchesChatWithEffort(hostVersion);
}
