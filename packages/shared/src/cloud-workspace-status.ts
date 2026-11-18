/**
 * Clients still accept `ready` and `deleted`, the old names of `awake` and
 * `archived`: the API sends them to builds below the legacy floors
 * (`client-status.ts` in packages/trpc), and new code can run under an old
 * version number (a mobile OTA update, a dev build). Nothing stores them.
 * TODO(SUPER-3018): drop the old names with the legacy status mapper.
 */
export function isAwakeCloudWorkspaceStatus(
	status: string | null | undefined,
): boolean {
	return status === "awake" || status === "ready";
}

export function isArchivedCloudWorkspaceStatus(
	status: string | null | undefined,
): boolean {
	return status === "archived" || status === "deleted";
}

/** Provisioned, and not failed or archived: awake or asleep, it can be used and opened. */
export function isLiveCloudWorkspaceStatus(status: string): boolean {
	return isAwakeCloudWorkspaceStatus(status) || status === "asleep";
}
