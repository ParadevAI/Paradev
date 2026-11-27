import {
	canTrack,
	markCookielessAnalytics,
	markTrackerLoaded,
} from "./consent";

export type PosthogMode = "full" | "cookieless";

/** Starts PostHog once: full with consent, cookieless without it. */
export function createPosthogStarter<T>(
	load: () => Promise<T>,
	init: (posthog: T, mode: PosthogMode) => void,
): () => Promise<void> {
	let loading = false;
	let mode: PosthogMode | null = null;
	return async () => {
		if (loading || mode) return;
		loading = true;
		let posthog: T;
		try {
			posthog = await load();
		} finally {
			loading = false;
		}
		if (mode) return;
		mode = canTrack() ? "full" : "cookieless";
		init(posthog, mode);
		if (mode === "full") markTrackerLoaded();
		else markCookielessAnalytics();
	};
}
