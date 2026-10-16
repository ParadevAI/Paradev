import {
	FILE_SWEEP_JOB_PATH,
	sweepOrphanFiles,
	sweepPendingFiles,
} from "@superset/trpc/file-sweep";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Daily. A `pending` row is an upload whose `complete` never came — the
 * client died mid-PUT, or verification failed after the object landed — and
 * after a day it is never completing. A `ready` row nothing references
 * belonged to a deleted parent whose inline cleanup did not finish.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		FILE_SWEEP_JOB_PATH,
	);
	if (rejected) return rejected;

	const pending = await sweepPendingFiles();
	const orphans = await sweepOrphanFiles();
	return Response.json({ pending: pending.swept, orphans: orphans.swept });
}
