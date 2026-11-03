import { expect, mock, test } from "bun:test";

type Input = {
	html: string;
	filename?: string;
	pageId?: string;
	workspaceId?: string;
	entryPath?: string;
};

const PAGE_ID = "3f7a1c22-9c2e-4e3a-9a8b-1f0b6c2d4e55";
let linked = false;
let published: Record<string, unknown> | undefined;
mock.module("../../caller", () => ({
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

const { tool: definition } = await import("./publish");
const schema = definition.inputSchema;
if (!schema) throw new Error("pages_publish has no input schema");

const call = async (input: Omit<Input, "html">) => {
	linked = Boolean(input.workspaceId);
	const parsed = schema.parse({
		html: "<h1>hi</h1>",
		...input,
	});
	return (await definition.handler(parsed, {} as never)) as Record<
		string,
		unknown
	>;
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
		schema.parse({ html: "<h1>hi</h1>", entryPath: "a.html" }),
	).toThrow();
});
