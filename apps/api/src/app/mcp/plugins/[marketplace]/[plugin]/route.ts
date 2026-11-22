import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	isMcpUnauthorized,
	type McpContext,
	resolveMcpContext,
} from "@superset/mcp";
import {
	AmbiguousConnectionError,
	AmbiguousPluginError,
	buildPluginServer,
	endUpstreamSessions,
	PluginTargetError,
	resolveTarget,
	sandboxAllowsPlugin,
	upstreamSessions,
} from "@superset/trpc/plugins-proxy";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { env } from "@/env";
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
import { callerSessionId, withIssuedSessionId } from "./utils/callerSession";

const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});

interface RouteParams {
	params: Promise<{ marketplace: string; plugin: string }>;
}

function errorResponse(
	code: string,
	message: string,
	status: number,
): Response {
	return Response.json({ error: { code, message } }, { status });
}

function describeServer(
	req: Request,
	marketplace: string,
	plugin: string,
): Response {
	const origin = getRequestOrigin(req);
	return Response.json(
		{
			name: plugin,
			marketplace,
			transport: "streamable-http",
			url: `${origin}/mcp/plugins/${marketplace}/${plugin}`,
			description: `Paradev MCP endpoint for the "${plugin}" plugin. Tools run against the calling user's connected ${plugin} account.`,
			usage:
				"POST JSON-RPC 2.0 messages to this URL with `Accept: application/json, text/event-stream` and a Bearer token (OAuth 2.1 access token or Paradev API key). Add ?connection=<id> to pin a specific connected account.",
			authentication: {
				type: "oauth2",
				resourceMetadataUrl: mcpProtectedResourceMetadataUrl(req),
			},
		},
		{ headers: { "Access-Control-Allow-Origin": "*" } },
	);
}

async function handle(
	req: Request,
	{ params }: RouteParams,
): Promise<Response> {
	const { marketplace, plugin } = await params;

	if (
		req.method === "GET" &&
		!(req.headers.get("accept") ?? "").includes("text/event-stream")
	) {
		return describeServer(req, marketplace, plugin);
	}

	const rateLimitState = await checkRateLimit(req, "ratelimit:mcp-plugins");
	if (rateLimitState && !rateLimitState.success) {
		return withRateLimitHeaders(rateLimitedResponse(), rateLimitState);
	}

	let ctx: McpContext;
	try {
		ctx = await resolveMcpContext(req, {
			apiUrl: env.NEXT_PUBLIC_API_URL,
			relayUrl: env.RELAY_URL,
			realtimeUrl: env.REALTIME_URL,
			sandboxCredential: true,
		});
	} catch (error) {
		if (isMcpUnauthorized(error)) {
			return withRateLimitHeaders(
				mcpUnauthorizedResponse(req, error.message),
				rateLimitState,
			);
		}
		throw error;
	}

	const connectionId = new URL(req.url).searchParams.get("connection");
	if (connectionId && !z.uuid().safeParse(connectionId).success) {
		return withRateLimitHeaders(
			errorResponse(
				"INVALID_CONNECTION",
				"connection must be a connection id.",
				400,
			),
			rateLimitState,
		);
	}

	if (
		ctx.source === "sandbox" &&
		!(
			ctx.sandboxWorkspaceId &&
			(await sandboxAllowsPlugin({
				workspaceId: ctx.sandboxWorkspaceId,
				marketplace,
				plugin,
			}))
		)
	) {
		return withRateLimitHeaders(
			errorResponse(
				"PLUGIN_NOT_ALLOWED",
				`This environment does not allow the ${plugin} plugin.`,
				403,
			),
			rateLimitState,
		);
	}

	const sessionId = callerSessionId(req);
	const sessions = sessionId
		? upstreamSessions(redis, ctx.userId, sessionId)
		: undefined;

	let server: Awaited<ReturnType<typeof buildPluginServer>>;
	try {
		const target = await resolveTarget({
			userId: ctx.userId,
			organizationId: ctx.organizationId,
			marketplace,
			plugin,
			connectionId,
		});
		if (req.method === "DELETE" && sessions) {
			await endUpstreamSessions(target, sessions);
		}
		server = await buildPluginServer(target, { sessions });
	} catch (error) {
		if (error instanceof PluginTargetError) {
			return withRateLimitHeaders(
				errorResponse("PLUGIN_UNAVAILABLE", error.message, error.status),
				rateLimitState,
			);
		}
		if (error instanceof AmbiguousConnectionError) {
			return withRateLimitHeaders(
				errorResponse("AMBIGUOUS_CONNECTION", error.message, 409),
				rateLimitState,
			);
		}
		if (error instanceof AmbiguousPluginError) {
			return withRateLimitHeaders(
				errorResponse("AMBIGUOUS_PLUGIN", error.message, 409),
				rateLimitState,
			);
		}
		throw error;
	}

	const transport = new WebStandardStreamableHTTPServerTransport();
	await server.connect(transport);

	const response = await transport.handleRequest(req, {
		authInfo: {
			token: ctx.bearerToken,
			clientId: ctx.source,
			scopes: ["mcp:full"],
			extra: { mcpContext: ctx },
		},
	});
	return withRateLimitHeaders(
		withIssuedSessionId(req, response),
		rateLimitState,
	);
}

export const maxDuration = 800;

export { handle as GET, handle as POST, handle as DELETE };
