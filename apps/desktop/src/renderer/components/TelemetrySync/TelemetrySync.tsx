import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { applyTelemetrySetting } from "renderer/lib/posthog-identity";

export function TelemetrySync() {
	const utils = electronTrpc.useUtils();
	const { data } = electronTrpc.settings.getTelemetryState.useQuery();
	electronTrpc.settings.onTelemetryChange.useSubscription(undefined, {
		onData: (state) =>
			utils.settings.getTelemetryState.setData(undefined, state),
	});
	const enabled = data ? data.enabled && !data.doNotTrack : undefined;

	useEffect(() => {
		if (enabled !== undefined) applyTelemetrySetting(enabled);
	}, [enabled]);

	return null;
}
