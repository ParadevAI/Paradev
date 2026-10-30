import * as Sentry from "@sentry/nextjs";
import { queueDailyBuilds } from "@superset/trpc/environment-build";
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

	const outcome = await Sentry.withMonitor(
		"environment-daily-builds",
		() => queueDailyBuilds(),
		{ schedule: { type: "crontab", value: "0 9 * * *" } },
	);
	return Response.json({ ok: true, ...outcome });
}
