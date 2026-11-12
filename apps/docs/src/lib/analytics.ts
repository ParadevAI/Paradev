import posthog, { type PostHog } from "posthog-js";

export function captureDocsEvent(...args: Parameters<PostHog["capture"]>) {
	return (posthog as PostHog & { docs?: PostHog }).docs?.capture(...args);
}
