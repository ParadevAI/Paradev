import * as Sentry from "@sentry/nextjs";
import { inferLocaleWithSource } from "@superset/i18n";
import {
	ANALYTICS_CONSENT_KEY,
	migrateAnalyticsOptOut,
	POSTHOG_CONSENT_CONFIG,
	readMarketingAnalyticsOptOut,
} from "@superset/shared/analytics-consent";
import { COMPANY, POSTHOG_COOKIE_NAME } from "@superset/shared/constants";
import {
	SENTRY_DENY_URLS,
	SENTRY_IGNORE_ERRORS,
} from "@superset/shared/sentry";
import posthog from "posthog-js";

import { env } from "@/env";

async function initPosthog(posthogKey: string) {
	const optedOut = migrateAnalyticsOptOut(ANALYTICS_CONSENT_KEY, posthogKey)
		? true
		: await readMarketingAnalyticsOptOut(
				new URL(env.NEXT_PUBLIC_MARKETING_URL || COMPANY.MARKETING_URL).origin,
			);
	if (optedOut === null) return;
	posthog.init(
		posthogKey,
		{
			...POSTHOG_CONSENT_CONFIG,
			opt_out_capturing_by_default: optedOut,
			api_host: "/ingest",
			ui_host: "https://us.posthog.com",
			defaults: "2025-11-30",
			capture_pageview: "history_change",
			capture_pageleave: true,
			capture_exceptions: true,
			debug: false,
			cross_subdomain_cookie: true,
			persistence: "cookie",
			persistence_name: POSTHOG_COOKIE_NAME,
			loaded: (posthog) => {
				if (optedOut) posthog.opt_out_capturing();
				const { locale, source } = inferLocaleWithSource();
				posthog.register({
					app_name: "docs",
					domain: window.location.hostname,
					app_locale: locale,
					app_locale_source: source,
				});
			},
		},
		"docs",
	);
}

if (env.NEXT_PUBLIC_POSTHOG_KEY) {
	void initPosthog(env.NEXT_PUBLIC_POSTHOG_KEY);
}

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_DOCS,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	replaysSessionSampleRate: 0,
	replaysOnErrorSampleRate: 0,
	sendDefaultPii: true,
	integrations: [
		Sentry.thirdPartyErrorFilterIntegration({
			filterKeys: ["superset-docs"],
			behaviour: "drop-error-if-exclusively-contains-third-party-frames",
		}),
	],
	ignoreErrors: SENTRY_IGNORE_ERRORS,
	denyUrls: SENTRY_DENY_URLS,
	debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
