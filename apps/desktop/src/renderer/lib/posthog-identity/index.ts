import { env } from "renderer/env.renderer";
import { posthog } from "renderer/lib/posthog";
import { setTelemetryEnabled } from "renderer/lib/telemetry";
import { createPostHogIdentity } from "./posthog-identity";

export const postHogIdentity = createPostHogIdentity({
	posthog,
	fetchFlags: async (request) => {
		const token = env.NEXT_PUBLIC_POSTHOG_KEY;
		if (!token) return null;
		try {
			const response = await fetch(
				`${env.NEXT_PUBLIC_POSTHOG_HOST}/flags/?v=2`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ token, ...request }),
				},
			);
			return response.ok ? await response.json() : null;
		} catch {
			return null;
		}
	},
});

export function applyTelemetrySetting(enabled: boolean): void {
	setTelemetryEnabled(enabled);
	postHogIdentity.apply(enabled);
}
