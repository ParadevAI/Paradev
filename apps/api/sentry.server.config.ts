import * as Sentry from "@sentry/nextjs";

import {
	CLOUD_WORKSPACE_PROVISION_TRANSACTION,
	CLOUD_WORKSPACE_START_TRANSACTION,
} from "@superset/shared/constants";

import { env } from "@/env";

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_API,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	// Tracing is off for requests: a flat 5% sampler once stored ~19M spans a
	// day, 115x the org quota, and #7388's narrow sampler recorded nothing at
	// all (cause unknown; the pdx1 move was measured in Vercel Observability).
	// Sampled: a cloud workspace's start and the provision job it queues,
	// which share a trace through the job's headers and flush themselves.
	tracesSampler: ({ name }) =>
		name === CLOUD_WORKSPACE_START_TRANSACTION ||
		name === CLOUD_WORKSPACE_PROVISION_TRANSACTION
			? 1
			: 0,
	sendDefaultPii: true,
	debug: false,
});
