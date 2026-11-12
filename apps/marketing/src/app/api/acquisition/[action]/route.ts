import { createBridgeHttp } from "@superset/shared/acquisition-bridge/http";
import { AcquisitionRestKV } from "@superset/shared/acquisition-bridge/rest-kv";
import { env } from "@/env";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
	request: Request,
	{ params }: { params: Promise<{ action: string }> },
) {
	const http = createBridgeHttp({
		kv: new AcquisitionRestKV(env.KV_REST_API_URL, env.KV_REST_API_TOKEN),
		webOrigin: env.NEXT_PUBLIC_WEB_URL,
		marketingOrigin: new URL(request.url).origin,
		consentKey: ANALYTICS_CONSENT_KEY,
	});
	return http.marketing(request, (await params).action);
}
export { handle as GET, handle as POST };
