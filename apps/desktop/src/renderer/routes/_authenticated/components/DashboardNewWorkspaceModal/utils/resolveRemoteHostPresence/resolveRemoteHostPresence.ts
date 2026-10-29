import { CLOUD_HOST_ID } from "@superset/shared/host-routing";

/**
 * "connecting" waits for presence before asking the host anything; "unknown"
 * is a host absent from the loaded host list, tried so its real error shows.
 */
export type RemoteHostPresence =
	| "online"
	| "offline"
	| "connecting"
	| "unknown";

interface KnownRemoteHost {
	id: string;
	isOnline: boolean;
	isConnecting: boolean;
}

export function resolveRemoteHostPresence({
	selectedHostId,
	localHostId,
	hosts,
	hostsSettled,
}: {
	selectedHostId: string | null;
	localHostId: string | null;
	hosts: KnownRemoteHost[];
	hostsSettled: boolean;
}): RemoteHostPresence | null {
	if (
		!selectedHostId ||
		selectedHostId === localHostId ||
		selectedHostId === CLOUD_HOST_ID
	)
		return null;
	const host = hosts.find((candidate) => candidate.id === selectedHostId);
	if (!host) return hostsSettled ? "unknown" : "connecting";
	if (host.isOnline) return "online";
	return host.isConnecting ? "connecting" : "offline";
}
