import { describe, expect, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { displayStorage, readStorage, userJwt, writeStorage } from "./command";

const UPDATED = "2026-10-01T12:00:00.000Z";

describe("displayStorage", () => {
	test("lists each key with its record count", () => {
		const output = displayStorage({
			pageId: "page-1",
			keys: [{ key: "votes", scope: "slot", records: 3, updatedAt: UPDATED }],
		});
		expect(output).toContain("KEY");
		expect(output).toMatch(/votes\s+slot\s+3/);
	});

	test("prints a long key whole so it can be passed to --key", () => {
		const key = "k".repeat(128);
		const output = displayStorage({
			pageId: "page-1",
			keys: [{ key, scope: "slot", records: 1, updatedAt: UPDATED }],
		});
		expect(output).toContain(key);
	});

	test("escapes control characters a viewer stored", () => {
		const keys = displayStorage({
			pageId: "page-1",
			keys: [
				{
					key: "\u001b[2Jvotes",
					scope: "slot",
					records: 1,
					updatedAt: UPDATED,
				},
			],
		});
		const slots = displayStorage({
			pageId: "page-1",
			key: "votes",
			scope: "slot",
			records: [
				{
					userId: "u1",
					name: "Ada",
					image: null,
					value: "\u009b2J",
					updatedAt: UPDATED,
				},
			],
		});
		expect(keys).toContain("\\u001b[2Jvotes");
		expect(slots).toContain("\\u009b2J");
		expect(`${keys}${slots}`).not.toContain("\u001b");
		expect(`${keys}${slots}`).not.toContain("\u009b");
	});

	test("shows every person's slot for one key", () => {
		const output = displayStorage({
			pageId: "page-1",
			key: "votes",
			scope: "slot",
			records: [
				{
					userId: "u1",
					name: "Ada",
					image: null,
					value: { pick: "b" },
					updatedAt: UPDATED,
				},
			],
		});
		expect(output).toMatch(/Ada\s+\{"pick":"b"\}/);
	});

	test("says so when a key has no records", () => {
		expect(
			displayStorage({
				pageId: "page-1",
				key: "votes",
				scope: "slot",
				records: [],
			}),
		).toBe('No records for key "votes".');
	});
});

function recordingFetch(status: number, body: unknown) {
	const requests: { url: string; headers: Headers }[] = [];
	const fetchImpl = (async (url: string, init?: RequestInit) => {
		requests.push({ url, headers: new Headers(init?.headers) });
		return Response.json(body, { status });
	}) as unknown as typeof fetch;
	return { fetchImpl, requests };
}

describe("readStorage", () => {
	test("asks realtime for one key with the user's token", async () => {
		const { fetchImpl, requests } = recordingFetch(200, {
			pageId: "page-1",
			key: "a b",
			records: [],
		});
		await readStorage({
			realtimeUrl: "https://realtime.test",
			jwt: "jwt",
			pageId: "page-1",
			key: "a b",
			fetchImpl,
		});
		expect(requests[0]?.url).toBe(
			"https://realtime.test/v2/page/page-1/storage/records?key=a%20b",
		);
		expect(requests[0]?.headers.get("authorization")).toBe("Bearer jwt");
	});

	test("tells someone who cannot open the page that they cannot read its storage", async () => {
		const { fetchImpl } = recordingFetch(403, {
			error: "You cannot read this page's storage",
		});
		const read = readStorage({
			realtimeUrl: "https://realtime.test",
			jwt: "jwt",
			pageId: "page-1",
			fetchImpl,
		});
		await expect(read).rejects.toBeInstanceOf(CLIError);
		await expect(read).rejects.toThrow("You cannot read this page's storage");
	});
});

describe("userJwt", () => {
	test("passes an OAuth access token through", async () => {
		const { fetchImpl, requests } = recordingFetch(200, {});
		expect(await userJwt("a.b.c", fetchImpl)).toBe("a.b.c");
		expect(requests).toHaveLength(0);
	});

	test("exchanges an API key for a token", async () => {
		const { fetchImpl, requests } = recordingFetch(200, { token: "minted" });
		expect(await userJwt("sk_live_abc", fetchImpl)).toBe("minted");
		expect(requests[0]?.url).toEndWith("/api/auth/token");
		expect(requests[0]?.headers.get("x-api-key")).toBe("sk_live_abc");
	});
});

describe("writeStorage", () => {
	test("posts the write with the user's token", async () => {
		const seen: { url: string; init?: RequestInit }[] = [];
		const result = await writeStorage({
			realtimeUrl: "https://rt.test",
			jwt: "user-jwt",
			pageId: "page-1",
			request: { op: "set", key: "data", value: { n: 1 }, scope: "shared" },
			fetchImpl: (async (url: string, init?: RequestInit) => {
				seen.push({ url, init });
				return Response.json({ ok: true });
			}) as typeof fetch,
		});
		expect(result).toEqual({ ok: true });
		expect(seen[0]?.url).toBe("https://rt.test/v2/page/page-1/storage/records");
		expect(seen[0]?.init?.method).toBe("POST");
		expect(JSON.parse(String(seen[0]?.init?.body))).toEqual({
			op: "set",
			key: "data",
			value: { n: 1 },
			scope: "shared",
		});
		const headers = seen[0]?.init?.headers as
			| Record<string, string>
			| undefined;
		expect(headers?.authorization).toBe("Bearer user-jwt");
	});

	test("a full page is a CLIError naming the cap", async () => {
		await expect(
			writeStorage({
				realtimeUrl: "https://rt.test",
				jwt: "user-jwt",
				pageId: "page-1",
				request: { op: "set", key: "data", value: 1 },
				fetchImpl: (async () =>
					Response.json(
						{
							error: "quota_exceeded: a page stores at most 20971520 bytes",
							code: "quota_exceeded",
						},
						{ status: 413 },
					)) as unknown as typeof fetch,
			}),
		).rejects.toThrow(/at most 20971520 bytes/);
	});
});

describe("writeStorage refusals", () => {
	test("a write that never answers times out with a CLIError", async () => {
		const write = writeStorage({
			realtimeUrl: "https://rt.test",
			jwt: "user-jwt",
			pageId: "page-1",
			request: { op: "set", key: "data", value: 1 },
			timeoutMs: 1,
			fetchImpl: ((_url: string, init?: RequestInit) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(init.signal?.reason),
					);
				})) as unknown as typeof fetch,
		});
		await expect(write).rejects.toMatchObject({
			message: "Page storage did not answer within 0.001 seconds",
		});
	});

	test("a 403 says writes need organization membership, not just access", async () => {
		const write = writeStorage({
			realtimeUrl: "https://rt.test",
			jwt: "user-jwt",
			pageId: "page-1",
			request: { op: "set", key: "data", value: 1, scope: "shared" },
			fetchImpl: (async () =>
				Response.json(
					{ error: "You cannot write this page's storage" },
					{ status: 403 },
				)) as unknown as typeof fetch,
		});
		await expect(write).rejects.toMatchObject({
			message: "You cannot write this page's storage",
			suggestion: expect.stringContaining(
				"signed-in members of the page's organization",
			),
		});
	});
});

describe("readStorage with a scope", () => {
	test("puts the scope on the query", async () => {
		let url = "";
		await readStorage({
			realtimeUrl: "https://rt.test",
			jwt: "user-jwt",
			pageId: "page-1",
			key: "draft",
			scope: "private",
			fetchImpl: (async (u: string) => {
				url = u;
				return Response.json({
					pageId: "page-1",
					key: "draft",
					scope: "private",
					records: [],
				});
			}) as typeof fetch,
		});
		expect(url).toBe(
			"https://rt.test/v2/page/page-1/storage/records?key=draft&scope=private",
		);
	});
});

test("the key list shows each key's scope", () => {
	const output = displayStorage({
		pageId: "page-1",
		keys: [{ key: "status", scope: "shared", records: 1, updatedAt: UPDATED }],
	});
	expect(output).toContain("SCOPE");
	expect(output).toMatch(/status\s+shared\s+1/);
});
