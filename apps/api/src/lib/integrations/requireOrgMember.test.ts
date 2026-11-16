import { describe, expect, test } from "bun:test";
import { auth } from "@superset/auth/server";
import { stub } from "../../../test/stub";
import { requireOrgMember } from "./requireOrgMember";

stub(auth.api, { getSession: async () => null });

const connect =
	"https://api.superset.sh/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2&plugin=ahrefs";

async function respond(headers: HeadersInit): Promise<Response> {
	const response = await requireOrgMember(new Request(connect, { headers }));
	if (!(response instanceof Response)) throw new Error("expected a response");
	return response;
}

describe("requireOrgMember", () => {
	test("a signed-out browser opening a connect link is sent to sign in and back", async () => {
		const response = await respond({ "sec-fetch-dest": "document" });

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location") ?? "");
		expect(location.pathname).toBe("/sign-in");
		expect(location.searchParams.get("redirect")).toBe(connect);
	});

	test("a signed-out programmatic caller still gets a JSON 401", async () => {
		const response = await respond({ accept: "application/json" });

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Unauthorized" });
	});
});
