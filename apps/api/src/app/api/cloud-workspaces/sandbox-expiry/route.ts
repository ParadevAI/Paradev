import { watchSandboxExpiry } from "@superset/trpc/cloud-workspace-sandbox-expiry";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

const payloadSchema = z
	.object({ cloudWorkspaceId: z.string().uuid() })
	.strict();

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/cloud-workspaces/sandbox-expiry",
	);
	if (rejected) return rejected;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error(
			"[cloud-workspaces/sandbox-expiry] invalid payload",
			parsed.error,
		);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const outcome = await watchSandboxExpiry(parsed.data);
	return Response.json({ ok: true, outcome });
}
