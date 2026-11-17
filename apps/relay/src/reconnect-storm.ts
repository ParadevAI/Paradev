export const RECONNECT_STORM_THRESHOLD = 5;
export const RECONNECT_STORM_WINDOW_MS = 10 * 60_000;

export interface HostConnectRecord {
	at: number;
	colo: string | null;
}

export function recordHostConnect(
	history: HostConnectRecord[],
	connect: HostConnectRecord,
): { history: HostConnectRecord[]; storm: boolean } {
	const since = connect.at - RECONNECT_STORM_WINDOW_MS;
	const recent = [...history.filter((entry) => entry.at > since), connect];
	return { history: recent, storm: recent.length > RECONNECT_STORM_THRESHOLD };
}
