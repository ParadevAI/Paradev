import { probeSandboxHost } from "@superset/shared/sandbox/reach";
import { watchForStoppedSandbox } from "@superset/shared/sandbox/watch";
import { useEffect, useRef } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import { sandboxAccess } from "renderer/routes/_authenticated/utils/sandboxAccess";

/** Wakes the open cloud workspace's box when its socket is down because the box stopped. */
export function useWakeWhenStopped(
	hostUrl: string | null,
	wake: () => Promise<unknown>,
): void {
	const wakeRef = useRef(wake);
	useEffect(() => {
		wakeRef.current = wake;
	}, [wake]);

	useEffect(() => {
		if (!hostUrl) return;
		const bus = getHostEventBus(hostUrl);
		const release = bus.retain();
		const stopWatching = watchForStoppedSandbox({
			bus,
			probe: async () => {
				const token = sandboxAccess.tokenFor(hostUrl);
				return token ? probeSandboxHost(hostUrl, token) : "unreachable";
			},
			wake: () => wakeRef.current(),
		});
		return () => {
			stopWatching();
			release();
		};
	}, [hostUrl]);
}
