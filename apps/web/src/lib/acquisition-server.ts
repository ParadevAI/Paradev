import { createBridgeHttp } from "@superset/shared/acquisition-bridge/http";
import { AcquisitionRestKV } from "@superset/shared/acquisition-bridge/rest-kv";
import type { IdentifyEvent } from "@superset/shared/acquisition-bridge/server";
import { PostHog } from "posthog-node";
import { env } from "@/env";

export const acquisitionHttp = createBridgeHttp({
	kv: new AcquisitionRestKV(env.KV_REST_API_URL, env.KV_REST_API_TOKEN),
	marketingOrigin: env.NEXT_PUBLIC_MARKETING_URL,
	webOrigin: env.NEXT_PUBLIC_WEB_URL,
	consentKey: "superset-analytics-consent",
	posthogKey: env.NEXT_PUBLIC_POSTHOG_KEY,
	marketingAvailable: async () => {
		try {
			return (
				await fetch(
					new URL("/api/acquisition/health", env.NEXT_PUBLIC_MARKETING_URL),
					{ cache: "no-store", signal: AbortSignal.timeout(1000) },
				)
			).ok;
		} catch {
			return false;
		}
	},
});
const analytics = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
	host: env.NEXT_PUBLIC_POSTHOG_HOST,
	flushAt: 1,
	flushInterval: 0,
	requestTimeout: 2000,
	fetchRetryCount: 0,
});
export async function captureAcquisition(event: IdentifyEvent): Promise<void> {
	analytics.capture(event);
	await analytics.flush();
}
