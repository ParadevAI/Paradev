import { PAGE_MANIFESTS_JOB_PATH } from "@superset/shared/page-storage-hub";
import {
	pageManifestsJobSchema,
	rewritePageManifests,
} from "@superset/trpc/page-manifests-job";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		PAGE_MANIFESTS_JOB_PATH,
	);
	if (rejected) return rejected;

	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const parsed = pageManifestsJobSchema.safeParse(payload);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	return Response.json(await rewritePageManifests(parsed.data.pageIds));
}
