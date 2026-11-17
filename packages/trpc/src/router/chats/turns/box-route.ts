import { env } from "../../../env";
import { type AppCaller, appCaller, recordAppCall } from "./app-access";
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
 * Whose access a box's request to an app's tools uses, or the response that
 * refuses it. `app` is one of the owner's plugins; omitted, Paradev itself.
 */
export async function chatsBoxAppCaller(
	request: Request,
	app?: string,
): Promise<AppCaller | Response> {
	const runtime = chatsTurnRuntime();
	if (!runtime) return new Response(null, { status: 404 });
	try {
		return await appCaller(await runtime.boxKeys(), request.headers, app);
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

export const chatsBoxParadevCaller = (request: Request) =>
	chatsBoxAppCaller(request);
