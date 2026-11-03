import type { DashboardSidebarGithubStatus } from "../../types";

export interface GithubStatusEntry {
	machineId: string;
	/** Undefined from a host older than the field; null when the sweep is healthy. */
	status: DashboardSidebarGithubStatus | null | undefined;
}

/**
 * One notice for the sidebar. The hold is per host, so the local machine's
 * wins (it is the one the user can fix), else the first remote host's. A
 * hold past its `until` is skipped: it can come from the persisted query
 * cache, or from a host whose query stopped polling.
 */
export function pickGithubStatus(
	entries: GithubStatusEntry[],
	localMachineId: string | null,
	now: number,
): { machineId: string; status: DashboardSidebarGithubStatus } | null {
	const held = entries.filter(
		(
			entry,
		): entry is GithubStatusEntry & {
			status: DashboardSidebarGithubStatus;
		} => !!entry.status && entry.status.until > now,
	);
	const pick =
		held.find((entry) => entry.machineId === localMachineId) ?? held[0];
	return pick ? { machineId: pick.machineId, status: pick.status } : null;
}
