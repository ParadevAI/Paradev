import { describe, expect, test } from "bun:test";
import * as connectors from "@superset/trpc/connectors";
import * as orgMember from "@/lib/integrations/requireOrgMember";
import { stub } from "../../../../../../test/stub";

stub(orgMember, {
	requireOrgMember: async () => ({ organizationId: "org-1", userId: "user-1" }),
});

stub(connectors, {
	resolveEndpoints: async () => {
		throw new Error(
			'Dynamic client registration with https://vercel.com failed: 400 {"error":"invalid_redirect_uri"}',
		);
	},
});

const { GET } = await import("./route");

describe("connector connect route", () => {
	test("a provider that refuses our client redirects back with an error, not a 500", async () => {
		const response = await GET(
			new Request(
				"http://localhost/api/connectors/vercel_mcp/connect?organizationId=org-1&method=oauth2",
			),
			{ params: Promise.resolve({ connector: "vercel_mcp" }) },
		);

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location") ?? "");
		expect(location.pathname).toBe("/connect/vercel_mcp");
		expect(location.searchParams.get("error")).toBe("connect_failed");
	});
});
