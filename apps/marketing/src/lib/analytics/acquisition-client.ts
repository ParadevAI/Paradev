import {
	collectTouchSnapshot,
	hasAnalyticsOptOut,
} from "@superset/shared/acquisition-bridge/browser";
import type { PostHog } from "posthog-js";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

const landingTouch =
	typeof window === "undefined"
		? null
		: collectTouchSnapshot({
				href: window.location.href,
				referrer: document.referrer,
			});
let pending: Promise<string | null> | null = null;
let lastIntentAt = 0;
export function acquisitionOptedOut(posthogKey: string): boolean {
	return hasAnalyticsOptOut(ANALYTICS_CONSENT_KEY, posthogKey);
}
export function syncAcquisition(optedOut: boolean): Promise<string | null> {
	const intentAt = Math.max(Date.now(), lastIntentAt + 1);
	lastIntentAt = intentAt;
	pending = (pending ?? Promise.resolve(null))
		.catch(() => null)
		.then(async () => {
			try {
				const response = await fetch("/api/acquisition/lineage", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						optedOut,
						intentAt,
						...(!optedOut ? { touch: landingTouch } : {}),
					}),
					keepalive: true,
					signal: AbortSignal.timeout(2500),
				});
				const value = response.ok
					? ((await response.json()) as { anonymousId?: unknown }).anonymousId
					: null;
				return !optedOut &&
					typeof value === "string" &&
					/^acq_[a-f0-9]{32}$/.test(value)
					? value
					: null;
			} catch {
				return null;
			}
		});
	return pending;
}
export async function syncPosthogAcquisition(posthog: PostHog): Promise<void> {
	const optedOut = () =>
		posthog.has_opted_out_capturing() ||
		acquisitionOptedOut(posthog.config.token);
	const anonymousId = await syncAcquisition(optedOut());
	if (
		optedOut() ||
		!anonymousId ||
		posthog.get_property("$user_state") === "identified"
	)
		return;
	if (posthog.get_distinct_id() !== anonymousId) {
		posthog.reset(true);
		posthog.register({
			distinct_id: anonymousId,
			$device_id: anonymousId,
			app_name: "marketing",
			domain: window.location.hostname,
		});
	}
}
