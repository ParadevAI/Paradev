import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";
import {
	isTelemetryEnabled,
	setTelemetryEnabled,
} from "renderer/lib/telemetry";

export function TelemetrySync() {
	const { data } = electronTrpc.settings.getTelemetryState.useQuery();
	const enabled = data ? data.enabled && !data.doNotTrack : undefined;

	useEffect(() => {
		if (enabled === undefined || enabled === isTelemetryEnabled()) return;
		setTelemetryEnabled(enabled);
		if (!posthog.__loaded) return;
		if (enabled) {
			posthog.opt_in_capturing();
		} else {
			posthog.opt_out_capturing();
			posthog.stopSessionRecording();
		}
	}, [enabled]);

	return null;
}
