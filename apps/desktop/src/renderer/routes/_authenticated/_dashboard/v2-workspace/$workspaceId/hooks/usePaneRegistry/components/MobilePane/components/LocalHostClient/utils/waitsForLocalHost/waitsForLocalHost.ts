import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";

interface LocalHostWithoutAddress {
	hostServiceStatus: HostServiceAvailabilityStatus;
	/** It has had no address for longer than a start takes. */
	graceElapsed: boolean;
}

/** Whether this machine's host service, with no address yet, can still come
 * up by itself. "running" is a live service whose port has not reached the
 * window. At boot the status can read "stopped" or "unknown" before the
 * start, so those wait for the grace period. */
export function waitsForLocalHost({
	hostServiceStatus,
	graceElapsed,
}: LocalHostWithoutAddress): boolean {
	return (
		hostServiceStatus === "starting" ||
		hostServiceStatus === "running" ||
		!graceElapsed
	);
}
