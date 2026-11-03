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
	| "production_run";

/** PostHog event name → Reddit Pixel standard event. */
const REDDIT_EVENT_MAP: Record<string, string> = {
	download_clicked: "Lead",
};

export function track(
	event: string,
	properties?: Record<string, unknown>,
): void {
	withPosthog((posthog) => posthog.capture(event, properties));

	const redditEvent = REDDIT_EVENT_MAP[event];
	if (redditEvent) {
		trackReddit(redditEvent, properties);
	}
}
