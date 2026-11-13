import {
	GOOGLE_ADS_DOWNLOAD_CONVERSION,
	trackGoogleAdsConversion,
} from "./google-ads";
import { withPosthog } from "./lazy";
import { trackReddit } from "./reddit";

export type DownloadSource =
	| "header"
	| "hero"
	| "footer"
	| "pages"
	| "automations"
	| "browser"
	| "plugins"
	| "pricing"
	| "compare"
	| "careers"
	| "factory_2026"
	| "production_run"
	| "conductor";

/** PostHog event name → Google Ads conversion action (send_to). */
const GOOGLE_ADS_EVENT_MAP: Record<string, string> = {
	download_clicked: GOOGLE_ADS_DOWNLOAD_CONVERSION,
};

/** PostHog event name → Reddit Pixel standard event. */
const REDDIT_EVENT_MAP: Record<string, string> = {
	download_clicked: "Lead",
};

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	withPosthog((posthog) => posthog.capture(event, properties));

	const googleAdsConversion = Object.hasOwn(GOOGLE_ADS_EVENT_MAP, event)
		? GOOGLE_ADS_EVENT_MAP[event]
		: undefined;
	if (googleAdsConversion) {
		trackGoogleAdsConversion(googleAdsConversion);
	}

	const redditEvent = Object.hasOwn(REDDIT_EVENT_MAP, event)
		? REDDIT_EVENT_MAP[event]
		: undefined;
	if (redditEvent) {
		trackReddit(redditEvent, properties);
	}
}
