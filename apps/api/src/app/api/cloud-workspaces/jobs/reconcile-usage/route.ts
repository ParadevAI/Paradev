import * as Sentry from "@sentry/nextjs";
import { reconcileCloudWorkspaces } from "@superset/trpc/cloud-workspace-sandbox-expiry";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run by a QStash schedule every 30 minutes. That schedule lives in the
 * Upstash console, not in this repo.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/cloud-workspaces/jobs/reconcile-usage",
	);
	if (rejected) return rejected;

	const outcome = await Sentry.withMonitor(
		"reconcile-usage",
		reconcileCloudWorkspaces,
		{ schedule: { type: "crontab", value: "*/30 * * * *" } },
	);
	// Turbopack builds do not wrap route handlers, so nothing else flushes the closing check-in.
	await Sentry.flush(2_000).catch(() => false);
	return Response.json({ ok: true, ...outcome });
}
