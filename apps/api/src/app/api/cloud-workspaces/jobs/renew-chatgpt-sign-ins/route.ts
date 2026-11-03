import * as Sentry from "@sentry/nextjs";
import { renewChatgptSignInsAndBoxes } from "@superset/trpc/lib/sandbox";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cloudflare returns 524 after ~100s of silence and QStash then retries, so
// a run stops early; the next run takes the rest.
const RUN_BUDGET_MS = 60_000;

/**
 * Run by a QStash schedule every hour. That schedule lives in the Upstash
 * console, not in this repo.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/cloud-workspaces/jobs/renew-chatgpt-sign-ins",
	);
	if (rejected) return rejected;

	const outcome = await Sentry.withMonitor(
		"renew-chatgpt-sign-ins",
		() => renewChatgptSignInsAndBoxes({ deadline: Date.now() + RUN_BUDGET_MS }),
		{ schedule: { type: "crontab", value: "0 * * * *" } },
	);
	// Turbopack builds do not wrap route handlers, so nothing else flushes the closing check-in.
	await Sentry.flush(2_000).catch(() => false);
	return Response.json({ ok: true, ...outcome });
}
