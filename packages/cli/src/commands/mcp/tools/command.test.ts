import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { env } from "../../../lib/env";
import { withTempSupersetHome } from "../../../lib/settings/test-helpers";
import toolsCommand from "./command";

const createIssue = {
	name: "create_issue",
	description: "Create an issue.",
	inputSchema: {
		type: "object" as const,
		properties: {
			title: { type: "string", description: "Issue title" },
			labels: { type: "array", items: { type: "string" } },
			priority: { enum: [1, 2, 3], default: 2 },
			due: { anyOf: [{ type: "string" }, { type: "null" }] },
		},
		required: ["title"],
	},
	outputSchema: {
		type: "object" as const,
		properties: { id: { type: "string", description: "New issue id" } },
	},
};

const proxy = Bun.serve({
	port: 0,
	async fetch(request) {
		const transport = new WebStandardStreamableHTTPServerTransport({
			enableJsonResponse: true,
		});
		const server = new Server(
			{ name: "stub", version: "1.0.0" },
			{ capabilities: { tools: {} } },
		);
		server.setRequestHandler(ListToolsRequestSchema, async () => ({
			tools: [
				createIssue,
				{ name: "ping", inputSchema: { type: "object" as const } },
			],
		}));
		await server.connect(transport);
		return transport.handleRequest(request);
	},
});
afterAll(() => proxy.stop(true));

withTempSupersetHome("superset-cli-mcp-tools-");
const originalApiUrl = env.SUPERSET_API_URL;
beforeEach(() => {
	env.SUPERSET_API_URL = `http://localhost:${proxy.port}`;
});
afterEach(() => {
	env.SUPERSET_API_URL = originalApiUrl;
});

async function listTools(tool?: string): Promise<{ data: unknown }> {
	return (await toolsCommand.run({
		ctx: { bearer: "test-key", config: {} },
		args: { tool },
		options: { plugin: "stub" },
		signal: new AbortController().signal,
	} as never)) as { data: unknown };
}

test("the list carries each tool's schemas as the server sent them", async () => {
	const { data } = await listTools();

	expect(data).toEqual([
		{
			plugin: "stub",
			tool: "create_issue",
			description: "Create an issue.",
			inputSchema: createIssue.inputSchema,
			outputSchema: createIssue.outputSchema,
		},
		{
			plugin: "stub",
			tool: "ping",
			description: "",
			inputSchema: { type: "object" },
			outputSchema: undefined,
		},
	]);
});

test("one tool shows its arguments and output as fields", async () => {
	const { data } = await listTools("create_issue");
	const text = toolsCommand.display?.(data) ?? "";

	expect(text).toContain("create_issue (stub)");
	expect(text).toMatch(/title\s+string\s+yes\s+Issue title/);
	expect(text).toMatch(/labels\s+string\[\]/);
	expect(text).toMatch(/priority\s+1 \| 2 \| 3\s+2/);
	expect(text).toMatch(/due\s+string \| null/);
	expect(text).toMatch(/Output:\nNAME.*\nid\s+string\s+New issue id/);
});

test("a tool with no arguments and no output says so", async () => {
	const text = toolsCommand.display?.((await listTools("ping")).data) ?? "";

	expect(text).toContain("Arguments:\nNone.");
	expect(text).toContain("Output:\nNot declared by the server.");
});

test("an unknown tool names the closest one", async () => {
	await expect(listTools("create_isue")).rejects.toThrow(
		expect.objectContaining({ suggestion: "Did you mean create_issue?" }),
	);
});
