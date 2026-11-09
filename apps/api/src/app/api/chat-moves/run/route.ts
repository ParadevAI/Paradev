import { runChatMove } from "@superset/trpc/chat-move-run";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

// Copying waits on the host it moves to: the bundle download, the journal
// import and the agent's start.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const payloadSchema = z.object({ moveId: z.string().uuid() }).strict();

/**
 * Runs a chat move that `chatMove.start`, `chatMove.retry` or a cloud
 * workspace's provisioning queued. The outcome is recorded on the move, so
 * this answers 200 whether or not it worked: a redelivery finds the move
 * claimed and does nothing.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/chat-moves/run",
	);
	if (rejected) return rejected;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[chat-moves/run] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const outcome = await runChatMove(parsed.data.moveId);
	return Response.json({ ok: true, outcome });
}
