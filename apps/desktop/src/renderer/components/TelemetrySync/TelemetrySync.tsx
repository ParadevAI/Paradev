import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { applyTelemetrySetting } from "renderer/lib/posthog-identity";

export function TelemetrySync() {
	const { data } = electronTrpc.settings.getTelemetryState.useQuery();
	const enabled = data ? data.enabled && !data.doNotTrack : undefined;

	useEffect(() => {
		if (enabled !== undefined) applyTelemetrySetting(enabled);
	}, [enabled]);

	return null;
}
