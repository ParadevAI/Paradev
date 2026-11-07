import { isTestAccountEmail } from "@superset/shared/constants";
import { useEffect } from "react";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";

export function TelemetrySync() {
	const { data: telemetryEnabled } =
		electronTrpc.settings.getTelemetryEnabled.useQuery();
	const { data: session } = authClient.useSession();
	const email = session?.user?.email;
	const captureEnabled =
		telemetryEnabled === undefined
			? undefined
			: telemetryEnabled && !(email && isTestAccountEmail(email));

	useEffect(() => {
		if (captureEnabled === undefined) return;

		if (captureEnabled) {
			if (typeof posthog?.opt_in_capturing === "function") {
				posthog.opt_in_capturing();
			}
		} else {
			if (typeof posthog?.opt_out_capturing === "function") {
				posthog.opt_out_capturing();
			}
		}
	}, [captureEnabled]);

	return null;
}
