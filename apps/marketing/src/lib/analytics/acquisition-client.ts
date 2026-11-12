import {
	type ConsentChoice,
	collectTouchSnapshot,
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
export function acquisitionConsent(): ConsentChoice {
	try {
		const value = localStorage.getItem(ANALYTICS_CONSENT_KEY);
		return value === "accepted" || value === "declined" ? value : "unknown";
	} catch {
		return "unknown";
	}
}
export function syncAcquisition(
	choice = acquisitionConsent(),
): Promise<string | null> {
	pending = (pending ?? Promise.resolve(null))
		.catch(() => null)
		.then(async () => {
			try {
				const response = await fetch("/api/acquisition/lineage", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						choice,
						...(choice === "accepted" ? { touch: landingTouch } : {}),
					}),
					keepalive: true,
					signal: AbortSignal.timeout(2500),
				});
				const value = response.ok
					? ((await response.json()) as { anonymousId?: unknown }).anonymousId
					: null;
				return choice === "accepted" &&
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
export async function acceptAcquisition(posthog: PostHog): Promise<void> {
	const anonymousId = await syncAcquisition("accepted");
	if (acquisitionConsent() === "accepted") posthog.opt_in_capturing();
	if (
		acquisitionConsent() !== "accepted" ||
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
	posthog.opt_in_capturing();
	posthog.capture("$pageview");
}
