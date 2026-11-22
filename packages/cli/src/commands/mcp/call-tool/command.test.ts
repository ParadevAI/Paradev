import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { env } from "../../../lib/env";
import { keepSessionId } from "../../../lib/plugins/mcp-sessions";
import { withTempSupersetHome } from "../../../lib/settings/test-helpers";
import callToolCommand from "./command";

const values = new Map<string, string>();
const deleted: string[] = [];

// Like the plugin route: stateless, an id issued on a POST without one, and
// an id it does not know is a fresh vendor session.
const proxy = Bun.serve({
	port: 0,
	async fetch(request) {
		const id = request.headers.get("mcp-session-id");
		if (request.method === "DELETE") {
			if (id) deleted.push(id);
			return new Response(null, { status: 200 });
		}
		const transport = new WebStandardStreamableHTTPServerTransport({
			enableJsonResponse: true,
		});
		const server = new Server(
			{ name: "stub", version: "1.0.0" },
			{ capabilities: { tools: {} } },
		);
		server.setRequestHandler(CallToolRequestSchema, async (call) => {
			const session = id ?? "";
			if (call.params.name === "set_value")
				values.set(session, String(call.params.arguments?.value));
			const text = values.get(session) ?? "none";
			return { content: [{ type: "text" as const, text }] };
		});
		await server.connect(transport);
		const response = await transport.handleRequest(request);
		if (!id && request.method === "POST")
			response.headers.set("mcp-session-id", randomUUID());
		return response;
	},
});
afterAll(() => proxy.stop(true));

withTempSupersetHome("superset-cli-call-tool-");
const AGENT_VARS = ["SUPERSET_AGENT_ID", "SUPERSET_AGENT_LAUNCH_ID"] as const;
const originalApiUrl = env.SUPERSET_API_URL;
const originalAgent = AGENT_VARS.map((name) => process.env[name]);

beforeEach(() => {
	env.SUPERSET_API_URL = `http://localhost:${proxy.port}`;
	for (const name of AGENT_VARS) delete process.env[name];
	deleted.length = 0;
});
afterEach(() => {
	env.SUPERSET_API_URL = originalApiUrl;
	AGENT_VARS.forEach((name, index) => {
		const value = originalAgent[index];
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	});
});

function inAgent(launchId: string): void {
	process.env.SUPERSET_AGENT_ID = "claude";
	process.env.SUPERSET_AGENT_LAUNCH_ID = launchId;
}

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

test("one agent's runs share one session", async () => {
	inAgent("4242-1795305367");

	await callTool("set_value", { value: "Production" });

	expect(await callTool("get_value")).toContain("Production");
	expect(deleted).toEqual([]);
});

test("two agents of the same program do not share a session", async () => {
	inAgent("4242-1795305367");
	await callTool("set_value", { value: "Production" });

	inAgent("5151-1795305390");
	expect(await callTool("get_value")).toContain("none");
});

test("a run outside an agent ends its session", async () => {
	await callTool("set_value", { value: "Production" });

	expect(deleted).toHaveLength(1);
	expect(await callTool("get_value")).toContain("none");
});

test("a kept id the proxy no longer knows starts a fresh session", async () => {
	inAgent("4242-1795305367");
	keepSessionId("4242-1795305367:stub:", randomUUID());

	expect(await callTool("get_value")).toContain("none");
	await callTool("set_value", { value: "Production" });
	expect(await callTool("get_value")).toContain("Production");
});
