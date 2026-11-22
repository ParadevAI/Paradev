import * as Sentry from "@sentry/nextjs";
import {
	isProductionDeployment,
	queueDailyBuilds,
} from "@superset/trpc/environment-build";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run by a QStash schedule once a day. That schedule lives in the Upstash
 * console, not in this repo.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/environments/jobs/daily-builds",
	);
	if (rejected) return rejected;
	// A preview would build production's environments on the copy of its data.
	if (!isProductionDeployment()) {
		return Response.json({ ok: true, enabled: false });
	}

	const outcome = await Sentry.withMonitor(
		"environment-daily-builds",
		queueDailyBuilds,
		{ schedule: { type: "crontab", value: "0 9 * * *" } },
	);
	// Turbopack builds do not wrap route handlers, so nothing else flushes the closing check-in.
	await Sentry.flush(2_000).catch(() => false);
	return Response.json({ ok: true, enabled: true, ...outcome });
}
