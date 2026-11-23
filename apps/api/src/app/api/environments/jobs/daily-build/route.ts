import {
	isProductionDeployment,
	runDailyBuild,
} from "@superset/trpc/environment-build";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ environmentId: z.string().uuid() });

/** One environment's daily build, queued by the daily-builds job with a delay. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/environments/jobs/daily-build",
	);
	if (rejected) return rejected;
	if (!isProductionDeployment()) {
		return Response.json({ ok: true, enabled: false });
	}
	const parsed = bodySchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		return Response.json({ error: "Invalid body" }, { status: 400 });
	}
	return Response.json({
		ok: true,
		...(await runDailyBuild(parsed.data.environmentId)),
	});
}
