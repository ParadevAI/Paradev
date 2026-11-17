import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { mcpContextForUser } from "@superset/mcp";
import { chatsBoxAppCaller, recordAppCall } from "@superset/trpc/chats-box";
import {
	AmbiguousConnectionError,
	AmbiguousPluginError,
	buildPluginServer,
	PluginTargetError,
	resolveTarget,
} from "@superset/trpc/plugins-proxy";
import { env } from "@/env";

interface RouteParams {
	params: Promise<{ plugin: string }>;
}

const refused = (code: string, message: string, status: number) =>
	Response.json({ code, message }, { status });

/** The tool a JSON-RPC body calls, when it calls one. */
async function calledTool(request: Request): Promise<string | null> {
	if (request.method !== "POST") return null;
	const body = (await request
		.clone()
		.json()
		.catch(() => null)) as {
		method?: string;
		params?: { name?: unknown };
	} | null;
	return body?.method === "tools/call" && typeof body.params?.name === "string"
		? body.params.name
		: null;
}

/** One of the owner's Paradev plugins for a Dev's box, run with the owner's connection. */
async function handle(
	request: Request,
	{ params }: RouteParams,
): Promise<Response> {
	const { plugin } = await params;
	const caller = await chatsBoxAppCaller(request, plugin);
	if (caller instanceof Response) return caller;
	const tool = await calledTool(request);

	let server: Awaited<ReturnType<typeof buildPluginServer>>;
	try {
		server = await buildPluginServer(
			await resolveTarget({
				userId: caller.ownerUserId,
				organizationId: caller.organizationId,
				plugin,
			}),
		);
	} catch (error) {
		if (error instanceof PluginTargetError) {
			return refused("plugin_unavailable", error.message, error.status);
		}
		if (
			error instanceof AmbiguousConnectionError ||
			error instanceof AmbiguousPluginError
		) {
			return refused("ambiguous", error.message, 409);
		}
		console.error(`[chats] a Dev's ${plugin} plugin did not open:`, error);
		return refused(
			"plugin_unavailable",
			"This plugin couldn't be opened with its owner's connection; the owner may need to reconnect it in Plugins",
			502,
		);
	}

	const context = await mcpContextForUser({
		userId: caller.ownerUserId,
		organizationId: caller.organizationId,
		clientLabel: "dev",
		relayUrl: env.RELAY_URL,
		realtimeUrl: env.REALTIME_URL,
	});
	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);
	const response = await transport.handleRequest(request, {
		authInfo: {
			token: context.bearerToken,
			clientId: context.source,
			scopes: ["mcp:full"],
			extra: { mcpContext: context },
		},
	});
	if (tool) {
		void recordAppCall(caller, { tool, ok: response.ok }).catch(
			(error: unknown) =>
				console.error("[chats] a Dev's plugin call was not recorded:", error),
		);
	}
	return response;
}

export const maxDuration = 300;

export { handle as GET, handle as POST, handle as DELETE };
