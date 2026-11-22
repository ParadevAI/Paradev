import { afterAll, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

type Definition = {
	inputSchema: z.ZodTypeAny;
	handler: (input: unknown, ctx: object) => Promise<unknown>;
};
const definitions = new Map<string, Definition>();
mock.module("../../define-tool", () => ({
	defineTool: (_server: unknown, value: Definition & { name: string }) => {
		definitions.set(value.name, value);
	},
}));

const PAGE_ID = "3f7a1c22-9c2e-4e3a-9a8b-1f0b6c2d4e55";
mock.module("../../caller", () => ({
	createMcpCaller: () => ({
		page: { get: async () => ({ id: PAGE_ID }) },
	}),
}));

const seen: {
	url: string;
	method: string;
	authorization: string | null;
	body: unknown;
}[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };
const realtime = Bun.serve({
	port: 0,
	async fetch(request) {
		const url = new URL(request.url);
		seen.push({
			url: url.pathname + url.search,
			method: request.method,
			authorization: request.headers.get("authorization"),
			body: request.method === "POST" ? await request.json() : null,
		});
		return Response.json(reply.body, { status: reply.status });
	},
});
afterAll(() => realtime.stop());

const { register } = await import("./storage");
register({} as McpServer);

const call = (name: string, input: Record<string, unknown>) => {
	const definition = definitions.get(name);
	if (!definition) throw new Error(`no tool ${name}`);
	return definition.handler(definition.inputSchema.parse(input), {
		realtimeUrl: `http://127.0.0.1:${realtime.port}`,
		bearerToken: "user-jwt",
	});
};

test("reads one key from realtime with the user's token, by slug", async () => {
	seen.length = 0;
	reply = {
		status: 200,
		body: { pageId: PAGE_ID, key: "votes", records: [] },
	};
	expect(await call("pages_storage", { slug: "q3", key: "votes" })).toEqual({
		pageId: PAGE_ID,
		key: "votes",
		records: [],
	});
	expect({ url: seen[0]?.url, authorization: seen[0]?.authorization }).toEqual({
		url: `/v2/page/${PAGE_ID}/storage/records?key=votes`,
		authorization: "Bearer user-jwt",
	});
});

test("an omitted or null key asks for the key list", async () => {
	seen.length = 0;
	reply = { status: 200, body: { pageId: PAGE_ID, keys: [] } };
	await call("pages_storage", { id: PAGE_ID });
	await call("pages_storage", { id: PAGE_ID, key: null });
	expect(seen.map((request) => request.url)).toEqual([
		`/v2/page/${PAGE_ID}/storage/records`,
		`/v2/page/${PAGE_ID}/storage/records`,
	]);
});

test("passes on realtime's refusal", async () => {
	reply = {
		status: 403,
		body: {
			error: "You cannot read this page's storage",
		},
	};
	await expect(call("pages_storage", { id: PAGE_ID })).rejects.toThrow(
		"You cannot read this page's storage",
	);
});

test("pages_storage_set posts a shared write as the user", async () => {
	seen.length = 0;
	reply = { status: 200, body: { ok: true } };
	expect(
		await call("pages_storage_set", {
			id: PAGE_ID,
			key: "data",
			value: { deals: 3 },
			scope: "shared",
		}),
	).toEqual({ ok: true });
	expect(seen[0]).toEqual({
		url: `/v2/page/${PAGE_ID}/storage/records`,
		method: "POST",
		authorization: "Bearer user-jwt",
		body: { op: "set", key: "data", value: { deals: 3 }, scope: "shared" },
	});
});

test("pages_storage_set refuses an omitted value but stores an explicit null", async () => {
	seen.length = 0;
	reply = { status: 200, body: { ok: true } };
	expect(() =>
		call("pages_storage_set", { id: PAGE_ID, key: "data", scope: "shared" }),
	).toThrow(/value is required/);
	expect(() =>
		call("pages_storage_set", { id: PAGE_ID, key: "data", value: undefined }),
	).toThrow(/value is required/);
	expect(seen).toEqual([]);
	await call("pages_storage_set", { id: PAGE_ID, key: "data", value: null });
	expect(seen[0]?.body).toEqual({
		op: "set",
		key: "data",
		value: null,
		scope: "slot",
	});
});

test("pages_storage_remove posts a remove", async () => {
	seen.length = 0;
	reply = { status: 200, body: { ok: true } };
	await call("pages_storage_remove", { slug: "q3", key: "data" });
	expect(seen[0]?.body).toEqual({ op: "remove", key: "data", scope: "slot" });
});

test("a write refusal comes back as the tool's error", async () => {
	reply = {
		status: 413,
		body: { error: "quota_exceeded: a page stores at most 20971520 bytes" },
	};
	await expect(
		call("pages_storage_set", { id: PAGE_ID, key: "data", value: 1 }),
	).rejects.toThrow(/at most 20971520 bytes/);
});

test("pages_storage reads a private key with its scope", async () => {
	seen.length = 0;
	reply = {
		status: 200,
		body: { pageId: PAGE_ID, key: "draft", scope: "private", records: [] },
	};
	await call("pages_storage", { id: PAGE_ID, key: "draft", scope: "private" });
	expect(seen[0]?.url).toBe(
		`/v2/page/${PAGE_ID}/storage/records?key=draft&scope=private`,
	);
});

test("a write that gets a bare 404 names a missing or unpublished page", async () => {
	reply = { status: 404, body: null };
	await expect(
		call("pages_storage_set", { id: PAGE_ID, key: "data", value: 1 }),
	).rejects.toThrow("Page not found or not published (404)");
});
