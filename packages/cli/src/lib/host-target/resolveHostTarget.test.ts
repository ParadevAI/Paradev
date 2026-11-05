import { afterAll, describe, expect, test } from "bun:test";
import type { ApiClient } from "../api-client";
import { resolveHostTarget } from "./resolveHostTarget";

const seen: Headers[] = [];
const relay = Bun.serve({
	port: 0,
	fetch: (request) => {
		seen.push(request.headers);
		return Response.json([{ result: { data: { json: [] } } }]);
	},
});
afterAll(() => relay.stop(true));

const api = {
	host: {
		relayEndpoint: { query: async () => ({ url: relay.url.origin }) },
	},
} as unknown as ApiClient;

describe("resolveHostTarget", () => {
	test("a cloud workspace calls the relay with no bearer, so its firewall-added credential is what counts", async () => {
		const target = await resolveHostTarget({
			requestedHostId: "some-other-host",
			organizationId: "1c0587c9-a74c-423c-ae40-b97296ad9b27",
			userJwt: "",
			api,
		});

		await target.client.workspace.list.query();

		expect(target.kind).toBe("remote");
		expect(seen.at(-1)?.get("authorization")).toBeNull();
	});
});
