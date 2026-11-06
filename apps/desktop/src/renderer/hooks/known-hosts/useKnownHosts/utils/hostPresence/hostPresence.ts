import type { HostConnectionStatus } from "@superset/workspace-client";

export function hostPresence(status: HostConnectionStatus | undefined): {
	isOnline: boolean;
	isConnecting: boolean;
} {
	const state = status?.state ?? "connecting";
	// The relay preflight answers before the socket gives up: a 503 there
	// already means offline, though the socket still reads "connecting".
	const relaySaysAbsent = status?.probe != null && status.probe.status !== 200;
	return {
		isOnline: state === "open",
		isConnecting: state === "connecting" && !relaySaysAbsent,
	};
}
