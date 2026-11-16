/**
 * `ready` and `deleted` are the old names of `awake` and `archived`. Rows not
 * yet backfilled still hold them, and so do responses to clients below the
 * legacy floor. Nothing writes them.
 * TODO(SUPER-3018): drop both spellings once the follow-up runs
 * `UPDATE ready -> awake, deleted -> archived` and every live client is past the floor.
 * Classify `ready` rows from a full `Sandbox.list`: the reconcile lists only boxes
 * that changed in its lookback, so a box stopped long ago stays `ready` until opened.
 */
export const AWAKE_CLOUD_WORKSPACE_STATUSES = ["awake", "ready"] as const;
export const ARCHIVED_CLOUD_WORKSPACE_STATUSES = [
	"archived",
	"deleted",
] as const;

export function isAwakeCloudWorkspaceStatus(
	status: string | null | undefined,
): boolean {
	return (AWAKE_CLOUD_WORKSPACE_STATUSES as readonly unknown[]).includes(
		status,
	);
}

export function isArchivedCloudWorkspaceStatus(
	status: string | null | undefined,
): boolean {
	return (ARCHIVED_CLOUD_WORKSPACE_STATUSES as readonly unknown[]).includes(
		status,
	);
}

/** Provisioned, and not failed or archived: awake or asleep, it can be used and opened. */
export function isLiveCloudWorkspaceStatus(status: string): boolean {
	return isAwakeCloudWorkspaceStatus(status) || status === "asleep";
}

/** The current name of a status that may still be stored under its old one. */
export function currentCloudWorkspaceStatus<S extends string>(
	status: S,
): Exclude<S, "ready" | "deleted"> | "awake" | "archived" {
	if (status === "ready") return "awake";
	if (status === "deleted") return "archived";
	return status as Exclude<S, "ready" | "deleted">;
}
