import {
	ORGANIZATION_PLUGIN_SYNC_PATH,
	syncOrganizationPluginSource,
} from "@superset/trpc/lib/organization-plugins";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ sourceId: z.string().uuid() });

/** Syncs one source, queued when an admin adds it or asks for a sync. */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		ORGANIZATION_PLUGIN_SYNC_PATH,
	);
	if (rejected) return rejected;

	let json: unknown = null;
	try {
		json = JSON.parse(body);
	} catch {}
	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Invalid body" }, { status: 400 });
	}

	const outcome = await syncOrganizationPluginSource(parsed.data.sourceId);
	if (!outcome) return Response.json({ ok: true, removed: true });
	return Response.json({ ok: !outcome.error, ...outcome });
}
