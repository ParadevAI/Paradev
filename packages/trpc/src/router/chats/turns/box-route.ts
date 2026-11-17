import { env } from "../../../env";
import { type AppCaller, paradevCaller, recordAppCall } from "./app-access";
import { handleBoxRequest } from "./box-api";
import { BoxRequestError } from "./box-auth";
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

export type { AppCaller };
export { recordAppCall };

/**
 * Whose access a box's request to Paradev's tools uses, or the response
 * that refuses it.
 */
export async function chatsBoxParadevCaller(
	request: Request,
): Promise<AppCaller | Response> {
	const runtime = chatsTurnRuntime();
	if (!runtime) return new Response(null, { status: 404 });
	try {
		return await paradevCaller(await runtime.boxKeys(), request.headers);
	} catch (error) {
		if (error instanceof BoxRequestError) {
			return Response.json(
				{ code: error.code, message: error.message },
				{ status: error.status },
			);
		}
		throw error;
	}
}
