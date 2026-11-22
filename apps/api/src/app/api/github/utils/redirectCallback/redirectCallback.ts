import { isOwnOriginTwin } from "@superset/shared/own-domains";
import { z } from "zod";
import { verifySignedState } from "@/lib/oauth-state";

const callbackStateSchema = z.object({
	organizationId: z.string(),
	userId: z.string(),
	timestamp: z.number(),
	callbackOrigin: z.string().optional(),
});

export function redirectCallback(
	request: Request,
	browserApiUrl: string,
): Response | null {
	const url = new URL(request.url);
	const state = url.searchParams.get("state");
	if (!state) return null;
	const payload = verifySignedState(state, callbackStateSchema);
	if (!payload?.callbackOrigin) return null;
	const origin = payload.callbackOrigin;
	if (
		origin === url.origin ||
		!isOwnOriginTwin(origin, new URL(browserApiUrl).origin)
	) {
		return null;
	}
	const destination = new URL("/api/github/callback", origin);
	destination.search = url.search;
	return new Response(null, {
		status: 302,
		headers: { Location: destination.toString(), "Cache-Control": "no-store" },
	});
}
