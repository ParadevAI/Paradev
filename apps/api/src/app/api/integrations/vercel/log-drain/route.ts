import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";
import { forwardAccessLogs } from "./forwardAccessLogs";
import { parseDrainBody, toAccessLogEntries } from "./toAccessLogEntries";
import { verifyDrainSignature } from "./verifyDrainSignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	if (
		!verifyDrainSignature({
			body,
			signature: request.headers.get("x-vercel-signature"),
			secret: env.VERCEL_LOG_DRAIN_SECRET,
		})
	) {
		return Response.json({ error: "Invalid signature" }, { status: 403 });
	}

	const entries = toAccessLogEntries(parseDrainBody(body));
	if (entries.length === 0) {
		return Response.json({ forwarded: 0 });
	}

	const failures = await forwardAccessLogs({
		entries,
		apiKey: env.PEEC_AGENT_ANALYTICS_API_KEY,
		organizationId: env.PEEC_ORGANIZATION_ID,
	});
	if (failures.length > 0) {
		console.error("[vercel/log-drain] Forwarding to Peec failed:", failures);
		Sentry.captureException(new Error("Peec access log forwarding failed"), {
			tags: { feature: "vercel-log-drain" },
			extra: { failures },
		});
	}

	// Vercel documents no redelivery for drains, so a 5xx would only mark the
	// drain as errored. The failure is in Sentry instead.
	const failed = failures.reduce((sum, failure) => sum + failure.entries, 0);
	return Response.json({ forwarded: entries.length - failed, failed });
}
