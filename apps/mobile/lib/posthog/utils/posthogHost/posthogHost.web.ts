import { env } from "../../../env";

// Under a base path the app is served by apps/web, whose /ingest proxies PostHog.
export const posthogHost: string = process.env.EXPO_BASE_URL
	? `${window.location.origin}/ingest`
	: env.EXPO_PUBLIC_POSTHOG_HOST;
