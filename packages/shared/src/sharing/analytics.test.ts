import { describe, expect, it } from "bun:test";
import { shareUiEventPayload } from "./analytics";

describe("shareUiEventPayload", () => {
	it("names the dialog opening per resource", () => {
		expect(shareUiEventPayload({ type: "opened" }, "page")).toEqual({
			name: "share_dialog_opened",
			properties: { resource_kind: "page" },
		});
	});

	it("records whether anything was shared on close", () => {
		expect(
			shareUiEventPayload({ type: "closed", shared: false }, "cloud_workspace"),
		).toEqual({
			name: "share_dialog_closed",
			properties: { resource_kind: "cloud_workspace", shared: false },
		});
	});

	it("reports failures as counts, never the emails", () => {
		const { name, properties } = shareUiEventPayload(
			{
				type: "failed",
				request: {
					grantees: [
						{ kind: "user", userId: "u1" },
						{ kind: "team", teamId: "t1" },
						{ kind: "user", userId: "u2" },
					],
					emails: ["someone@example.com"],
					role: "comment",
				},
				error: "Rate limit exceeded. Max 10 invitations per hour.",
			},
			"page",
		);
		expect(name).toBe("share_failed");
		expect(properties).toEqual({
			resource_kind: "page",
			user_count: 2,
			team_count: 1,
			email_count: 1,
			error: "Rate limit exceeded. Max 10 invitations per hour.",
		});
		expect(JSON.stringify(properties)).not.toContain("someone@example.com");
	});
});
