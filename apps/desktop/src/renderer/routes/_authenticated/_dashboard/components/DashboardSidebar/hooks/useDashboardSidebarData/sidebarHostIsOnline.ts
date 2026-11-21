import type { KnownHostRow } from "renderer/hooks/known-hosts/useKnownHosts";

/** Null while unknown: not in the roster yet, or its first connection still in flight. */
export function sidebarHostIsOnline(
	host: Pick<KnownHostRow, "isOnline" | "isConnecting"> | undefined,
): boolean | null {
	if (!host || host.isConnecting) return null;
	return host.isOnline;
}
