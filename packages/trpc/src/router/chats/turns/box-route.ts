import { env } from "../../../env";
import { handleBoxRequest } from "./box-api";
import { CHATS_BOX_API_PATH } from "./box-path";
import { chatsTurnRuntime } from "./runtime";

/** A box's request to the API, or a 404 where no Devs run. */
export async function chatsBoxRoute(request: Request): Promise<Response> {
	const runtime = chatsTurnRuntime();
	if (!runtime) return new Response(null, { status: 404 });
	const { pathname } = new URL(request.url);
	const at = pathname.indexOf(CHATS_BOX_API_PATH);
	return handleBoxRequest(
		{
			keys: await runtime.boxKeys(),
			turns: runtime,
			gatewayKey: env.VERCEL_AI_GATEWAY_KEY,
		},
		request,
		pathname.slice(at + CHATS_BOX_API_PATH.length),
	);
}
