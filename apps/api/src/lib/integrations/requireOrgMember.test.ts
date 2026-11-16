import { describe, expect, test } from "bun:test";
import { auth } from "@superset/auth/server";
import * as dbUtils from "@superset/db/utils";
import { stub } from "../../../test/stub";

let signedInAs: string | null = null;
stub(auth.api, {
	getSession: async () =>
		signedInAs ? { user: { id: signedInAs }, session: {} } : null,
});
stub(dbUtils, {
	findOrgMembership: async ({ userId }: { userId: string }) =>
		userId === "member" ? { role: "member" } : null,
});

const { requireOrgMember } = await import("./requireOrgMember");

const BROWSER = {
	accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

async function respond(url: string, headers?: HeadersInit): Promise<Response> {
	const response = await requireOrgMember(new Request(url, { headers }));
	if (!(response instanceof Response)) throw new Error("expected a response");
	return response;
}

async function redirectFrom(url: string, headers?: HeadersInit): Promise<URL> {
	const response = await respond(url, { ...BROWSER, ...headers });
	expect(response.status).toBe(302);
	return new URL(response.headers.get("location") ?? "");
}

describe("requireOrgMember", () => {
	test("a browser with no session is sent to sign in and back to the connect link", async () => {
		signedInAs = null;
		const connect =
			"https://api.superset.sh/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2&plugin=ahrefs";

		const location = await redirectFrom(connect);

		expect(location.origin).toBe("https://app.superset.sh");
		expect(location.pathname).toBe("/sign-in");
		expect(location.searchParams.get("redirect")).toBe(connect);
		expect(location.searchParams.has("reason")).toBe(false);
	});

	test("a browser whose session cookie no longer resolves is told its session expired", async () => {
		signedInAs = null;
		const connect =
			"https://api.paradev.com/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2&plugin=ahrefs";

		const location = await redirectFrom(connect, {
			cookie: "__Secure-better-auth.session_token=revoked.signature",
		});

		expect(location.origin).toBe("https://app.paradev.com");
		expect(location.pathname).toBe("/sign-in");
		expect(location.searchParams.get("redirect")).toBe(connect);
		expect(location.searchParams.get("reason")).toBe("session_expired");
	});

	test("sign-in happens on the connect link's own root domain, where its cookie will be sent", async () => {
		signedInAs = null;
		const connect =
			"https://api.paradev.com/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2";

		const location = await redirectFrom(connect);

		expect(location.origin).toBe("https://app.paradev.com");
		expect(location.searchParams.get("redirect")).toBe(connect);
	});

	test("a browser signed in to an account outside the organization is offered to switch account", async () => {
		signedInAs = "outsider";
		const connect =
			"https://api.paradev.com/api/integrations/linear/connect?organizationId=org-1";

		const location = await redirectFrom(connect);

		expect(location.origin).toBe("https://app.paradev.com");
		expect(location.pathname).toBe("/switch-account");
		expect(location.searchParams.get("redirect")).toBe(connect);
	});

	test("a member gets through", async () => {
		signedInAs = "member";
		const result = await requireOrgMember(
			new Request(
				"https://api.paradev.com/api/integrations/linear/connect?organizationId=org-1",
				{ headers: BROWSER },
			),
		);
		expect(result).toEqual({
			organizationId: "org-1",
			userId: "member",
			role: "member",
		});
	});

	describe("an API client keeps its JSON error", () => {
		const connect =
			"https://api.paradev.com/api/connectors/ahrefs_mcp/connect?organizationId=org-1";
		const clients: Array<[string, HeadersInit]> = [
			["no text/html in Accept", { accept: "application/json" }],
			["no Accept", {}],
			["an Authorization header", { ...BROWSER, authorization: "Bearer x" }],
			["x-trpc-source", { ...BROWSER, "x-trpc-source": "desktop" }],
		];

		for (const [name, headers] of clients) {
			test(`no session, ${name}: 401`, async () => {
				signedInAs = null;
				const response = await respond(connect, headers);
				expect(response.status).toBe(401);
				expect(await response.json()).toEqual({ error: "Unauthorized" });
			});

			test(`wrong account, ${name}: 403`, async () => {
				signedInAs = "outsider";
				const response = await respond(connect, headers);
				expect(response.status).toBe(403);
				expect(await response.json()).toEqual({
					error: "User is not a member of this organization",
				});
			});
		}
	});
});
