import { settleBoot } from "@superset/trpc/cloud-workspace-meter";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({ bootId: z.string().min(1) }).strict();

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/cloud-workspaces/meter",
	);
	if (rejected) return rejected;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[cloud-workspaces/meter] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const outcome = await settleBoot(parsed.data.bootId);
	return Response.json({ ok: true, outcome });
}
