import { describe, expect, test } from "bun:test";
import { auth } from "@superset/auth/server";
import { stub } from "../../../test/stub";
import { requireOrgMember } from "./requireOrgMember";

stub(auth.api, { getSession: async () => null });

async function signInRedirect(connect: string): Promise<URL> {
	const response = await requireOrgMember(new Request(connect));
	if (!(response instanceof Response)) throw new Error("expected a response");
	expect(response.status).toBe(302);
	return new URL(response.headers.get("location") ?? "");
}

describe("requireOrgMember", () => {
	test("a browser with no session is sent to sign in and back to the connect link", async () => {
		const connect =
			"https://api.superset.sh/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2&plugin=ahrefs";

		const location = await signInRedirect(connect);

		expect(location.origin).toBe("https://app.superset.sh");
		expect(location.pathname).toBe("/sign-in");
		expect(location.searchParams.get("redirect")).toBe(connect);
	});

	test("sign-in happens on the connect link's own root domain, where its cookie will be sent", async () => {
		const connect =
			"https://api.paradev.com/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2";

		const location = await signInRedirect(connect);

		expect(location.origin).toBe("https://app.paradev.com");
		expect(location.searchParams.get("redirect")).toBe(connect);
	});
});
