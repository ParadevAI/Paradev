import { describe, expect, test } from "bun:test";
import * as callback from "@/lib/integrations/resolveCallback";
import { stub } from "../../../../../test/stub";

stub(callback, {
	resolveCallback: async (request: Request) => ({
		organizationId: "org-1",
		userId: "user-1",
		role: "member",
		url: new URL(request.url),
		params: { installation_id: "123" },
		state: "state",
		exit: (location: string) => Response.redirect(location),
		fail: (error: string) => Response.redirect(`http://web/?error=${error}`),
	}),
});

const { GET } = await import("./route");

describe("GitHub install callback", () => {
	test("a member who is not an admin cannot save an installation", async () => {
		const response = await GET(
			new Request("http://localhost/api/github/callback?installation_id=123"),
		);

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("location") ?? "");
		expect(location.pathname).toBe("/integrations/github");
		expect(location.searchParams.get("error")).toBe("admin_required");
	});
});
