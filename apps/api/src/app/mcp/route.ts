import { createMcpHandler } from "@modelcontextprotocol/server";
import {
	createMcpServer,
	isMcpUnauthorized,
	MCP_SERVER_VERSION,
	type McpContext,
	resolveMcpContext,
} from "@superset/mcp";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { TURN_TOKEN_HEADER } from "@superset/trpc";
import { env } from "@/env";
import { posthog } from "@/lib/analytics";
import {
	checkRateLimit,
	rateLimitedResponse,
	withRateLimitHeaders,
} from "@/lib/mcp-rate-limit";
import {
	getRequestOrigin,
	mcpProtectedResourceMetadataUrl,
	mcpUnauthorizedResponse,
} from "@/lib/oauth-metadata";

// A plain GET (no `Accept: text/event-stream`) is not an MCP stream request;
// it is a human or an agent following a link. Describe the server instead of
// answering 401, so the endpoint URL itself resolves to something useful.
function describeServer(req: Request): Response {
	const origin = getRequestOrigin(req);
	return Response.json(
		{
			name: "superset",
			title: "Paradev",
			version: MCP_SERVER_VERSION,
			description:
				"Paradev MCP server (Model Context Protocol over Streamable HTTP). Create Git-worktree workspaces, launch coding-agent sessions, open terminals, schedule automations, and manage tasks on behalf of a Paradev user.",
			transport: "streamable-http",
			url: `${origin}/mcp`,
			usage:
				"POST JSON-RPC 2.0 messages to this URL with `Accept: application/json, text/event-stream` and a Bearer token (OAuth 2.1 access token or Paradev API key). Speaks MCP 2026-07-28 (call `server/discover`, then `tools/list`) and answers 2025-era clients statelessly.",
			serverCard: `${origin}/.well-known/mcp/server-card.json`,
			openapi: `${origin}/openapi.json`,
			documentation: `${CANONICAL_URLS.DOCS}/mcp-server`,
			authentication: {
				type: "oauth2",
				resourceMetadataUrl: mcpProtectedResourceMetadataUrl(req),
				walkthrough: `${CANONICAL_URLS.MARKETING}/auth.md`,
			},
			install: `${CANONICAL_URLS.MARKETING}/mcp-install`,
		},
		{
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Cache-Control": "public, max-age=3600, s-maxage=3600",
			},
		},
	);
}

const handler = createMcpHandler(({ authInfo }) => {
	const context = authInfo?.extra?.mcpContext as McpContext;
	return createMcpServer({
		kind: context.kind,
		context,
		onToolCall: (event) => {
			posthog.capture({
				distinctId: event.userId,
				event: "mcp_tool_called",
				properties: {
					tool: event.toolName,
					caller_kind: event.callerKind,
					agent_id: event.agentId,
					organization_id: event.organizationId,
					auth_source: event.source,
					client_label: event.clientLabel,
					duration_ms: event.durationMs,
					success: event.success,
					error_message: event.errorMessage,
					mcp_server: "superset-v2",
					mcp_server_version: MCP_SERVER_VERSION,
				},
				groups: { organization: event.organizationId },
			});
		},
	});
});

async function handle(req: Request): Promise<Response> {
	if (
		req.method === "GET" &&
		!(req.headers.get("accept") ?? "").includes("text/event-stream")
	) {
		return describeServer(req);
	}

	const rateLimitState = await checkRateLimit(req);
	if (rateLimitState && !rateLimitState.success) {
		return withRateLimitHeaders(rateLimitedResponse(), rateLimitState);
	}

	let context: McpContext;
	try {
		context = await resolveMcpContext(req, {
			apiUrl: env.NEXT_PUBLIC_API_URL,
			relayUrl: env.RELAY_URL,
			realtimeUrl: env.REALTIME_URL,
		});
	} catch (error) {
		if (isMcpUnauthorized(error)) {
			// A Dev can't sign in, so an OAuth challenge would only send its client looking for one.
			const response = req.headers.has(TURN_TOKEN_HEADER)
				? Response.json({ error: error.message }, { status: 401 })
				: mcpUnauthorizedResponse(req, error.message);
			return withRateLimitHeaders(response, rateLimitState);
		}
		throw error;
	}

	const response = await handler.fetch(req, {
		authInfo: {
			token: context.kind === "dev" ? context.turnToken : context.bearerToken,
			clientId: context.source,
			scopes: ["mcp:full"],
			extra: { mcpContext: context },
		},
	});
	return withRateLimitHeaders(response, rateLimitState);
}

export const maxDuration = 800;

export { handle as GET, handle as POST, handle as DELETE };
