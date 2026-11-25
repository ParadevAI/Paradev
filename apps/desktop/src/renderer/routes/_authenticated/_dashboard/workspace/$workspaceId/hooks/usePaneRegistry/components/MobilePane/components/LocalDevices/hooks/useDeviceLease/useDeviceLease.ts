import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef, useState } from "react";
import type { LocalDevice } from "../../components/DevicePicker";
import { deviceKey } from "../../utils/deviceKey";

const HOLD_INTERVAL_MS = 10_000;

/** Holds the device while this pane shows it, so the host shuts down a
 * device it booted once no pane shows it. */
export function useDeviceLease(device: LocalDevice | null) {
	const client = workspaceTrpc.useUtils().client;
	const [holder] = useState(() => crypto.randomUUID());
	const deviceRef = useRef(device);
	deviceRef.current = device;
	const key = device ? deviceKey(device) : null;

	useEffect(() => {
		const current = deviceRef.current;
		if (!key || !current) return;
		const input = {
			platform: current.platform,
			id: current.id,
			name: current.name,
			holder,
		};
		const hold = () => {
			client.mobile.holdLocalDevice.mutate(input).catch(() => {});
		};
		hold();
		const timer = setInterval(hold, HOLD_INTERVAL_MS);
		return () => {
			clearInterval(timer);
			client.mobile.releaseLocalDevice.mutate(input).catch(() => {});
		};
	}, [key, holder, client]);
}
