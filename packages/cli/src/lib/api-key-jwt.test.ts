import { describe, expect, it } from "bun:test";
import { jwtForApiKey } from "./api-key-jwt";

function tokenEndpoint(status = 200) {
	const calls: Array<{ url: string; apiKey: string | null }> = [];
	const fetchImpl = (async (url: string, init?: RequestInit) => {
		calls.push({
			url,
			apiKey: new Headers(init?.headers).get("x-api-key"),
		});
		return new Response(JSON.stringify({ token: "minted.jwt.token" }), {
			status,
		});
	}) as unknown as typeof fetch;
	return { calls, fetchImpl };
}

describe("jwtForApiKey", () => {
	it("passes a JWT or any other credential through untouched", async () => {
		const { calls, fetchImpl } = tokenEndpoint();
		expect(await jwtForApiKey("a.b.c", fetchImpl)).toBe("a.b.c");
		expect(await jwtForApiKey("", fetchImpl)).toBe("");
		expect(calls).toHaveLength(0);
	});

	it("trades an API key for a JWT once per run", async () => {
		const { calls, fetchImpl } = tokenEndpoint();
		expect(await jwtForApiKey("sk_live_once", fetchImpl)).toBe(
			"minted.jwt.token",
		);
		expect(await jwtForApiKey("sk_live_once", fetchImpl)).toBe(
			"minted.jwt.token",
		);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url.endsWith("/api/auth/token")).toBe(true);
		expect(calls[0]?.apiKey).toBe("sk_live_once");
	});

	it("says the key was refused, and tries again on the next call", async () => {
		const refused = tokenEndpoint(401);
		await expect(
			jwtForApiKey("sk_live_refused", refused.fetchImpl),
		).rejects.toThrow("Could not get a token for this API key (401)");
		const { fetchImpl } = tokenEndpoint();
		expect(await jwtForApiKey("sk_live_refused", fetchImpl)).toBe(
			"minted.jwt.token",
		);
	});
});
