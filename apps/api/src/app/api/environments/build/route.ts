import { rebuildEnvironment } from "@superset/trpc/environment-build";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const payloadSchema = z.object({ buildId: z.string().uuid() }).strict();

/** Runs one environment build that `startEnvironmentBuild` recorded. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/environments/build",
	);
	if (rejected) return rejected;

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[environments/build] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	// The outcome is on the build row; a redelivery of a finished build is a no-op.
	const outcome = await rebuildEnvironment(parsed.data);
	return Response.json({ ok: true, outcome });
}
