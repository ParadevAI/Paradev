import { describe, expect, test } from "bun:test";
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
	test("a member who is not an admin is sent back without starting an install", async () => {
		const response = await GET(
			new Request("http://localhost/api/github/install?organizationId=org-1"),
		);

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location") ?? "");
		expect(location.pathname).toBe("/integrations/github");
		expect(location.searchParams.get("error")).toBe("admin_required");
	});
});
