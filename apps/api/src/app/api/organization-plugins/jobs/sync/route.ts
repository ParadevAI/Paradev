import * as Sentry from "@sentry/nextjs";
import {
	syncAllOrganizationPluginSources,
	syncOrganizationPluginSource,
} from "@superset/trpc/lib/organization-plugins";
import { Client } from "@upstash/qstash";
import { z } from "zod";
import { env } from "@/env";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const qstash = new Client({ token: env.QSTASH_TOKEN });
const SYNC_PATH = "/api/organization-plugins/jobs/sync";

async function enqueueSource(sourceId: string): Promise<void> {
	if (env.NODE_ENV === "development") {
		await syncOrganizationPluginSource(sourceId);
		return;
	}
	await qstash.publishJSON({
		url: `${env.NEXT_PUBLIC_API_URL}${SYNC_PATH}`,
		body: { sourceId },
		retries: 3,
	});
}

const bodySchema = z.object({ sourceId: z.string().uuid().optional() });

/**
 * One source when an admin asks for a sync. The daily QStash schedule calls
 * with no body and this route queues one job per source. That schedule lives in the Upstash
 * console, not in this repo.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/organization-plugins/jobs/sync",
	);
	if (rejected) return rejected;

	let json: unknown = {};
	try {
		json = body ? JSON.parse(body) : {};
	} catch {
		json = null;
	}
	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Invalid body" }, { status: 400 });
	}

	if (parsed.data.sourceId) {
		const outcome = await syncOrganizationPluginSource(parsed.data.sourceId);
		return Response.json({ ok: !outcome.error, ...outcome });
	}
	const outcome = await Sentry.withMonitor(
		"organization-plugin-sync",
		() => syncAllOrganizationPluginSources(enqueueSource),
		{ schedule: { type: "crontab", value: "0 6 * * *" } },
	);
	return Response.json({ ok: true, ...outcome });
}
