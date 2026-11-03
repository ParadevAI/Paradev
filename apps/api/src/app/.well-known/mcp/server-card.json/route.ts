import { listTools as listMcpTools } from "@superset/mcp/in-memory";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { getRequestOrigin } from "@/lib/oauth-metadata";

async function listTools() {
	const tools = await listMcpTools("person");
	return tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		...(tool.annotations ? { annotations: tool.annotations } : {}),
		inputSchema: tool.inputSchema,
	}));
}

export async function GET(request: Request): Promise<Response> {
	const origin = getRequestOrigin(request);

	const card = {
		name: "superset",
		title: "Paradev",
		icon: `${CANONICAL_URLS.MARKETING}/apple-touch-icon.png`,
		description:
			"Paradev MCP server: create Git-worktree workspaces, launch coding-agent sessions, schedule automations, open terminals, and manage tasks on behalf of a Paradev user.",
		version: "0.1.0",
		serverUrl: `${origin}/mcp`,
		transport: "streamable-http",
		documentationUrl: `${CANONICAL_URLS.DOCS}/mcp-server`,
		authentication: {
			type: "oauth2",
			resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
			description: `OAuth 2.1 authorization code + PKCE with RFC 7591 dynamic client registration, or a user-issued Paradev API key as a Bearer token. Walkthrough: ${CANONICAL_URLS.MARKETING}/auth.md`,
		},
		tools: await listTools(),
	};

	return Response.json(card, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
