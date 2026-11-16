/** Provisioned, and not failed or deleted: awake or asleep, it can be used and opened. */
export function isLiveCloudWorkspaceStatus(status: string): boolean {
	return status === "ready" || status === "asleep";
}
