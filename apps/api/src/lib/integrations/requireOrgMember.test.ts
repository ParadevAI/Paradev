import { describe, expect, test } from "bun:test";
import { auth } from "@superset/auth/server";
import { env } from "@/env";
import { stub } from "../../../test/stub";
import { requireOrgMember } from "./requireOrgMember";

stub(auth.api, { getSession: async () => null });

describe("requireOrgMember", () => {
	test("a browser with no session is sent to sign in and back to the connect link", async () => {
		const connect =
			"https://api.superset.sh/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2&plugin=ahrefs";

		const response = await requireOrgMember(new Request(connect));
		if (!(response instanceof Response)) throw new Error("expected a response");

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location") ?? "");
		expect(location.origin).toBe(new URL(env.NEXT_PUBLIC_WEB_URL).origin);
		expect(location.pathname).toBe("/sign-in");
		expect(location.searchParams.get("redirect")).toBe(connect);
	});
});
