import { expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

type Input = {
	html: string;
	filename?: string;
	pageId?: string;
	workspaceId?: string;
	entryPath?: string;
};
let definition: {
	inputSchema: z.ZodObject;
	handler: (input: Input, ctx: object) => Promise<unknown>;
};
const realDefineTool = await import("../../define-tool");
const { defineTool } = realDefineTool;
const testServer = {} as McpServer;
mock.module("../../define-tool", () => ({
	...realDefineTool,
	defineTool: (server: McpServer, value: typeof definition) => {
		if (server !== testServer) return defineTool(server, value as never);
		definition = value;
	},
}));

const PAGE_ID = "3f7a1c22-9c2e-4e3a-9a8b-1f0b6c2d4e55";
let linked = false;
let published: Record<string, unknown> | undefined;
const realCaller = await import("../../caller");
mock.module("../../caller", () => ({
	...realCaller,
	createMcpCaller: () => ({
		page: {
			assets: {
				upload: async () => ({ fileId: "file", upload: null }),
			},
			publish: async (input: Record<string, unknown>) => {
				published = input;
				return { id: PAGE_ID, version: 1, url: "https://pages/x", linked };
			},
		},
	}),
}));

const { register } = await import("./publish");
register(testServer);

const call = async (input: Omit<Input, "html">) => {
	linked = Boolean(input.workspaceId);
	const parsed = definition.inputSchema.parse({
		html: "<h1>hi</h1>",
		...input,
	}) as Input;
	return (await definition.handler(parsed, {})) as Record<string, unknown>;
};

test("publishes with no workspace at all", async () => {
	const result = await call({});
	expect(published).toMatchObject({ fileId: "file", filename: "page.html" });
	expect(published?.workspaceId).toBeUndefined();
	expect(result.id).toBe(PAGE_ID);
});

test("an unanchored publish comes back saying how to version it", async () => {
	const result = await call({});
	expect(result.republish).toContain(PAGE_ID);
	expect(result.republish).toContain("pageId");
});

test("a workspace publish says nothing — the entry path versions it", async () => {
	const result = await call({
		workspaceId: "9f1ca3e7-df91-43a1-bfa2-b4f9ac14aeb0",
		entryPath: "reports/q3.html",
	});
	expect(result.linked).toBe(true);
	expect(result.republish).toBeUndefined();
});

test("a publish by id says nothing — that caller already holds the id", async () => {
	const result = await call({ pageId: PAGE_ID });
	expect(result.linked).toBe(false);
	expect(result.republish).toBeUndefined();
});

test("still refuses half a workspace key", () => {
	expect(() =>
		definition.inputSchema.parse({ html: "<h1>hi</h1>", entryPath: "a.html" }),
	).toThrow();
});
