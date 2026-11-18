import * as Sentry from "@sentry/nextjs";
import {
	RETENTION_JOB_PATH,
	reapCloudWorkspaceRetention,
} from "@superset/trpc/cloud-workspace-retention";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run by a QStash schedule daily at 06:00 UTC. That schedule lives in the
 * Upstash console, not in this repo.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(request, body, RETENTION_JOB_PATH);
	if (rejected) return rejected;

	const outcome = await Sentry.withMonitor(
		"reap-retention",
		() =>
			reapCloudWorkspaceRetention({
				production: process.env.VERCEL_ENV === "production",
			}),
		{ schedule: { type: "crontab", value: "0 6 * * *" } },
	);
	// Turbopack builds do not wrap route handlers, so nothing else flushes the closing check-in.
	await Sentry.flush(2_000).catch(() => false);
	return Response.json({ ok: true, ...outcome });
}
