import type { CloudWorkspaceStatus } from "@superset/db/schema";

/** Provisioned, and not failed or archived: awake or asleep, it can be used and opened. */
export function isLiveStatus(status: CloudWorkspaceStatus): boolean {
	return status === "awake" || status === "asleep";
}
