import posthogFull from "posthog-js/dist/module.full.no-external";
import type { PostHog } from "posthog-js/react";
import { env } from "../env.renderer";
import { isTelemetryEnabled } from "./telemetry";

// Cast to standard PostHog type for compatibility with posthog-js/react
export const posthog = posthogFull as unknown as PostHog;

export function initPostHog() {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
		console.log("[posthog] No key configured, skipping");
		return;
	}

	const telemetryEnabled = isTelemetryEnabled();
	posthogFull.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
		api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
		defaults: "2025-11-30",
		capture_pageview: false,
		capture_pageleave: false,
		capture_exceptions: telemetryEnabled,
		person_profiles: "always",
		persistence: "localStorage",
		debug: false,
		opt_out_capturing_by_default: !telemetryEnabled,
		disable_session_recording: !telemetryEnabled,
		disable_surveys: !telemetryEnabled,
		capture_dead_clicks: telemetryEnabled,
		capture_performance: telemetryEnabled,
		before_send: (event) => (isTelemetryEnabled() ? event : null),
		...(telemetryEnabled ? {} : { advanced_disable_flags: true }),
	});

	posthogFull.register({
		app_name: "desktop",
		// Saved insights still split desktop traffic on `surface`; v1 is gone,
		// so every event now carries the one remaining value.
		surface: "v2",
		// Event-level version (person-profile desktop_version reflects the
		// current install, not the build that emitted a given event).
		app_version: window.App?.appVersion,
		platform: window.navigator.platform,
	});
}
