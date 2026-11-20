import {
	REAPPLY_RULES_JOB_PATH,
	reapplyRulesFor,
} from "@superset/trpc/lib/sandbox";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cloudflare returns 524 after ~100s of silence and QStash then retries.
const RUN_BUDGET_MS = 60_000;

const id = z.string().uuid();
const payloadSchema = z.union([
	z.object({ userId: id }).strict(),
	z.object({ organizationId: id }).strict(),
	z.object({ environmentId: id }).strict(),
	z.object({ cloudWorkspaceId: id }).strict(),
]);

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		REAPPLY_RULES_JOB_PATH,
	);
	if (rejected) return rejected;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const outcome = await reapplyRulesFor(parsed.data, {
		deadline: Date.now() + RUN_BUDGET_MS,
	});
	console.info("[cloud-workspaces/reapply-rules]", parsed.data, outcome);
	return Response.json({ ok: true, ...outcome });
}
