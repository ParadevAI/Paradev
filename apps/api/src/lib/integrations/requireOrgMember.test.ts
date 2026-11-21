import { describe, expect, test } from "bun:test";
import { auth } from "@superset/auth/server";
import * as dbUtils from "@superset/db/utils";
import { stub } from "../../../test/stub";
import { requireOrgMember } from "./requireOrgMember";

let signedIn = false;
stub(auth.api, {
	getSession: async () => (signedIn ? { user: { id: "user-1" } } : null),
});
stub(dbUtils, { findOrgMembership: async () => undefined });

const connect =
	"https://api.superset.sh/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2&plugin=ahrefs";

async function respond(
	session: "signed-out" | "other-account",
	headers: HeadersInit,
): Promise<Response> {
	signedIn = session === "other-account";
	const response = await requireOrgMember(new Request(connect, { headers }));
	if (!(response instanceof Response)) throw new Error("expected a response");
	return response;
}

describe("requireOrgMember", () => {
	test("a signed-out browser opening a connect link is sent to sign in and back", async () => {
		const response = await respond("signed-out", {
			"sec-fetch-dest": "document",
		});

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location") ?? "");
		expect(location.pathname).toBe("/sign-in");
		expect(location.searchParams.get("redirect")).toBe(connect);
	});

	test("a browser signed in to an account outside the org is offered to switch accounts and come back", async () => {
		const response = await respond("other-account", {
			"sec-fetch-dest": "document",
		});

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location") ?? "");
		expect(location.origin).toBe("https://app.superset.sh");
		expect(location.pathname).toBe("/auth/switch-account");
		expect(location.searchParams.get("redirect")).toBe(connect);
	});

	test("programmatic callers keep the JSON errors", async () => {
		const signedOut = await respond("signed-out", {
			accept: "application/json",
		});
		expect(signedOut.status).toBe(401);
		expect(await signedOut.json()).toEqual({ error: "Unauthorized" });

		const otherAccount = await respond("other-account", {
			accept: "application/json",
		});
		expect(otherAccount.status).toBe(403);
		expect(await otherAccount.json()).toEqual({
			error: "User is not a member of this organization",
		});
	});
});
