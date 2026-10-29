import type { HostConnectionState } from "@superset/workspace-client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { useSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";

/** A box that is already up answers well inside this, so its connect never shows. */
const CONNECTING_GRACE_MS = 600;

const noSubscription = () => () => {};

/**
 * Whether this client is still dialing the open cloud workspace's box. Call it
 * for the open workspace only: reading a sandbox's socket opens one, and a
 * held socket keeps the box awake.
 */
export function useSandboxIsConnecting(workspaceId: string): boolean {
	const { targets } = useSandboxAccess();
	const hostUrl =
		targets.find((target) => target.workspaceId === workspaceId)?.url ?? null;
	const bus = useMemo(
		() => (hostUrl ? getHostEventBus(hostUrl) : null),
		[hostUrl],
	);
	const state = useSyncExternalStore<HostConnectionState | null>(
		useCallback(
			(onChange) =>
				bus ? bus.subscribeConnectionStatus(onChange) : noSubscription(),
			[bus],
		),
		() => bus?.getConnectionStatus().state ?? null,
	);
	return useDelayElapsed(
		state === "connecting" || state === "reconnecting",
		CONNECTING_GRACE_MS,
	);
}
