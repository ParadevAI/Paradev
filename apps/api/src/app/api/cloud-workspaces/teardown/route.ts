import { teardownSandbox } from "@superset/trpc/cloud-workspace-teardown";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const payloadSchema = z
	.object({
		providerSandboxId: z.string().min(1),
		driveName: z.string().min(1).nullable(),
		attempt: z.number().int().min(0),
		keepDrive: z.boolean().optional(),
	})
	.strict();

/** Stops a box, then deletes it and its drive once the drive has detached; requeues itself until then. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/cloud-workspaces/teardown",
	);
	if (rejected) return rejected;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[cloud-workspaces/teardown] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const outcome = await teardownSandbox(parsed.data);
	return Response.json({ ok: true, outcome });
}
