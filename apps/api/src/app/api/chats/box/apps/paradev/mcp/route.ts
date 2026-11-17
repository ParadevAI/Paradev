import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer, mcpContextForUser } from "@superset/mcp";
import { chatsBoxParadevCaller, recordAppCall } from "@superset/trpc/chats-box";
import { env } from "@/env";

/** Paradev's own tools for a Dev's box, run as the Dev's owner. */
async function handle(request: Request): Promise<Response> {
	const caller = await chatsBoxParadevCaller(request);
	if (caller instanceof Response) return caller;
	const context = await mcpContextForUser({
		userId: caller.ownerUserId,
		organizationId: caller.organizationId,
		clientLabel: "dev",
		relayUrl: env.RELAY_URL,
		realtimeUrl: env.REALTIME_URL,
	});
	const server = createMcpServer({
		onToolCall: (event) => {
			void recordAppCall(caller, {
				tool: event.toolName,
				ok: event.success,
				result: event.result,
			}).catch((error: unknown) =>
				console.error("[chats] a Dev's Paradev call was not recorded:", error),
			);
		},
	});
	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);
	return transport.handleRequest(request, {
		authInfo: {
			token: context.bearerToken,
			clientId: context.source,
			scopes: ["mcp:full"],
			extra: { mcpContext: context },
		},
	});
}

export const maxDuration = 300;

export { handle as GET, handle as POST, handle as DELETE };
