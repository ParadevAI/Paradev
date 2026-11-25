import { describe, expect, test } from "bun:test";
import { getBrowserApiUrl } from "@superset/shared/browser-api-url";
import { env } from "@/env";
import * as orgMember from "@/lib/integrations/requireOrgMember";
import { stub } from "../../../../../test/stub";

stub(orgMember, {
	requireOrgMember: async () => ({
		organizationId: "org-1",
		userId: "user-1",
		role: "member",
	}),
});

const { GET } = await import("./route");

describe("GitHub install route", () => {
	test("moves an alternate host to the configured API before setting a cookie", async () => {
		const response = await GET(
			new Request(
				"https://alternate.test/api/github/install?organizationId=org-1",
			),
		);
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			`${new URL(getBrowserApiUrl(env)).origin}/api/github/install?organizationId=org-1`,
		);
		expect(response.headers.get("set-cookie")).toBeNull();
	});

	test("a member who is not an admin is sent back without starting an install", async () => {
		const response = await GET(
			new Request(
				`${getBrowserApiUrl(env)}/api/github/install?organizationId=org-1`,
			),
		);

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location") ?? "");
		expect(location.pathname).toBe("/integrations/github");
		expect(location.searchParams.get("error")).toBe("admin_required");
	});
});
