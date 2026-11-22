import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { env } from "../../../lib/env";
import { withTempSupersetHome } from "../../../lib/settings/test-helpers";
import callToolCommand from "./command";

const live = new Map<string, WebStandardStreamableHTTPServerTransport>();
const values = new Map<string, string>();
const deleted: string[] = [];

async function openSession(): Promise<WebStandardStreamableHTTPServerTransport> {
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: randomUUID,
		enableJsonResponse: true,
		onsessioninitialized: (id) => {
			live.set(id, transport);
		},
		onsessionclosed: (id) => {
			live.delete(id);
			deleted.push(id);
		},
	});
	const server = new Server(
		{ name: "stub", version: "1.0.0" },
		{ capabilities: { tools: {} } },
	);
	server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
		const session = extra.sessionId ?? "";
		if (request.params.name === "set_value")
			values.set(session, String(request.params.arguments?.value));
		const text = values.get(session) ?? "none";
		return { content: [{ type: "text" as const, text }] };
	});
	await server.connect(transport);
	return transport;
}

const proxy = Bun.serve({
	port: 0,
	async fetch(request) {
		const id = request.headers.get("mcp-session-id");
		if (!id) return (await openSession()).handleRequest(request);
		const transport = live.get(id);
		return transport
			? transport.handleRequest(request)
			: new Response(null, { status: 404 });
	},
});
afterAll(() => proxy.stop(true));

withTempSupersetHome("superset-cli-call-tool-");
const originalApiUrl = env.SUPERSET_API_URL;
const originalAgentId = process.env.SUPERSET_AGENT_ID;

beforeEach(() => {
	env.SUPERSET_API_URL = `http://localhost:${proxy.port}`;
	delete process.env.SUPERSET_AGENT_ID;
	deleted.length = 0;
});
afterEach(() => {
	env.SUPERSET_API_URL = originalApiUrl;
	if (originalAgentId === undefined) delete process.env.SUPERSET_AGENT_ID;
	else process.env.SUPERSET_AGENT_ID = originalAgentId;
});

async function callTool(
	tool: string,
	args: Record<string, unknown> = {},
): Promise<string> {
	const result = (await callToolCommand.run({
		ctx: { bearer: "test-key", config: {} },
		args: { tool, arguments: JSON.stringify(args) },
		options: { plugin: "stub" },
		signal: new AbortController().signal,
	} as never)) as { message: string };
	return result.message;
}

test("an agent's runs share one session", async () => {
	process.env.SUPERSET_AGENT_ID = "agent-1";

	await callTool("set_value", { value: "Production" });

	expect(await callTool("get_value")).toContain("Production");
	expect(deleted).toEqual([]);
});

test("another agent does not see that session", async () => {
	process.env.SUPERSET_AGENT_ID = "agent-a";
	await callTool("set_value", { value: "Production" });

	process.env.SUPERSET_AGENT_ID = "agent-b";
	expect(await callTool("get_value")).toContain("none");
});

test("a run outside an agent ends its session", async () => {
	await callTool("set_value", { value: "Production" });

	expect(deleted).toHaveLength(1);
	expect(await callTool("get_value")).toContain("none");
});
