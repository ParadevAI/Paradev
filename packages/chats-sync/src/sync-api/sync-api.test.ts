import { afterEach, describe, expect, test } from "bun:test";
import { createSyncApi } from "./sync-api.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

function respond(status: number) {
	const calls: { url: string; init?: RequestInit }[] = [];
	globalThis.fetch = (async (url: string, init?: RequestInit) => {
		calls.push({ url, init });
		return new Response(null, { status });
	}) as typeof fetch;
	return calls;
}

describe("push tokens", () => {
	const api = createSyncApi("http://api", "session");
	const token = "ExponentPushToken[abc]";

	test("registers a token with the device's name, as the signed-in user", async () => {
		const calls = respond(204);
		await api.registerPushToken(token, "Harshith's iPhone");
		expect(calls[0]?.url).toBe("http://api/push-tokens");
		expect(calls[0]?.init?.method).toBe("POST");
		expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(
			"Bearer session",
		);
		expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
			token,
			deviceName: "Harshith's iPhone",
		});
	});

	test("unregisters a token, escaped for the path", async () => {
		const calls = respond(204);
		await api.unregisterPushToken(token);
		expect(calls[0]?.url).toBe(
			"http://api/push-tokens/ExponentPushToken%5Babc%5D",
		);
		expect(calls[0]?.init?.method).toBe("DELETE");
	});
});

describe("file uploads", () => {
	const api = createSyncApi("http://api", "session");

	test("a part goes as raw bytes; opening and finishing as JSON", async () => {
		const calls = respond(204);
		await api.putFilePart("g1", "u1", 2, new Uint8Array([1, 2, 3]));
		expect(calls[0]?.url).toBe("http://api/groups/g1/files/uploads/u1/parts/2");
		expect(calls[0]?.init?.method).toBe("POST");
		expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe(
			"application/octet-stream",
		);
		expect(calls[0]?.init?.body).toEqual(new Uint8Array([1, 2, 3]));

		await api.beginFileUpload("g1", { name: "a.pdf", size: 3 });
		await api.finishFileUpload("g1", {
			uploadId: "u1",
			name: "a.pdf",
			size: 3,
			sha256: "ff",
			clientId: "c1",
		});
		expect(
			calls
				.slice(1)
				.map((c) => [
					c.url,
					new Headers(c.init?.headers).get("content-type"),
					JSON.parse(String(c.init?.body)),
				]),
		).toEqual([
			[
				"http://api/groups/g1/files/uploads",
				"application/json",
				{ name: "a.pdf", size: 3 },
			],
			[
				"http://api/groups/g1/files",
				"application/json",
				{
					uploadId: "u1",
					name: "a.pdf",
					size: 3,
					sha256: "ff",
					clientId: "c1",
				},
			],
		]);
	});
});

describe("public pages and passes", () => {
	function capture(body: unknown) {
		const calls: { url: string; init?: RequestInit }[] = [];
		globalThis.fetch = (async (url: string, init?: RequestInit) => {
			calls.push({ url, init });
			return Response.json(body);
		}) as typeof fetch;
		return calls;
	}
	const api = createSyncApi("http://api", "session");

	test("reads, switches and moves a Dev's public page", async () => {
		const link = { enabled: true, url: "http://api/m/abc" };
		let calls = capture(link);
		expect(await api.updatePublicLink("m1", { enabled: true })).toEqual(link);
		expect(calls[0]?.url).toBe("http://api/devs/m1/public-link");
		expect(calls[0]?.init?.method).toBe("PATCH");
		expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ enabled: true });
		calls = capture(link);
		await api.rotatePublicLink("m1");
		expect([calls[0]?.url, calls[0]?.init?.method]).toEqual([
			"http://api/devs/m1/public-link/rotate",
			"POST",
		]);
	});

	test("asks for the Dev's pass link", async () => {
		const calls = capture({ available: false });
		expect(await api.devPass("m1")).toEqual({ available: false });
		expect(calls[0]?.url).toBe("http://api/devs/m1/pass");
		expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(
			"Bearer session",
		);
	});
});
