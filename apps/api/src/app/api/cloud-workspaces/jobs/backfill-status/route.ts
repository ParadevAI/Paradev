import { backfillLegacyAwakeStatus } from "@superset/trpc/cloud-workspace-backfill-status";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One-off, not scheduled: publish it once from the QStash console, and again
 * until it reports `remaining: 0`.
 * TODO(SUPER-3018): delete with backfillLegacyAwakeStatus.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/cloud-workspaces/jobs/backfill-status",
	);
	if (rejected) return rejected;
	return Response.json({ ok: true, ...(await backfillLegacyAwakeStatus()) });
}
