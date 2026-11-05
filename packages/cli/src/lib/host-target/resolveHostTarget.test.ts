import { describe, expect, it } from "bun:test";
import type { ApiClient } from "../api-client";
import { resolveHostTarget } from "./resolveHostTarget";

const api = {
	host: {
		relayEndpoint: { query: async () => ({ url: "https://relay.test" }) },
	},
} as unknown as ApiClient;

const mintJwt = (async () =>
	new Response(
		JSON.stringify({ token: "minted.jwt.token" }),
	)) as unknown as typeof fetch;

describe("resolveHostTarget", () => {
	it("reaches a remote host with a JWT traded for the API key", async () => {
		const target = await resolveHostTarget({
			requestedHostId: "other-machine",
			organizationId: "org-1",
			userJwt: "sk_live_remote",
			api,
			fetchImpl: mintJwt,
		});
		expect(target.kind).toBe("remote");
		expect(target.ws.token).toBe("minted.jwt.token");
	});

	it("explains that the cloud is not one host", async () => {
		await expect(
			resolveHostTarget({
				requestedHostId: "cloud",
				organizationId: "org-1",
				userJwt: "a.b.c",
				api,
			}),
		).rejects.toThrow("`--host cloud` is not one host");
	});
});
