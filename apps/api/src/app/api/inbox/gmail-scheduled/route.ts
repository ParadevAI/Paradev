import {
	scheduledSendSchema,
	sendScheduledDraft,
} from "@superset/trpc/inbox-gmail-schedule";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

/** Sends a Gmail draft the reader scheduled from an inbox card. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/inbox/gmail-scheduled",
	);
	if (rejected) return rejected;
	const parsed = scheduledSendSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[inbox/gmail-scheduled] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const outcome = await sendScheduledDraft(parsed.data);
	return Response.json({ ok: true, outcome });
}
