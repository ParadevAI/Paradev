import { describe, expect, it } from "bun:test";
import { shareErrorCategory, shareUiEventPayload } from "./analytics";

describe("shareUiEventPayload", () => {
	it("names the dialog opening per resource", () => {
		expect(shareUiEventPayload({ type: "opened" }, "page")).toEqual({
			name: "share_dialog_opened",
			properties: { resource_kind: "page" },
		});
	});

	it("records on close whether anything was shared and whether they could", () => {
		expect(
			shareUiEventPayload(
				{ type: "closed", shared: false, canManage: true },
				"cloud_workspace",
			),
		).toEqual({
			name: "share_dialog_closed",
			properties: {
				resource_kind: "cloud_workspace",
				shared: false,
				can_manage: true,
			},
		});
	});

	it("records each invitation a share created, by id", () => {
		expect(
			shareUiEventPayload(
				{ type: "invite_created", invitationId: "inv_1" },
				"page",
			),
		).toEqual({
			name: "share_invite_created",
			properties: { resource_kind: "page", invitation_id: "inv_1" },
		});
	});

	it("reports failures as counts and a category, never an email", () => {
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
				// The client's fallback message names the email.
				error: "Could not invite someone@example.com",
			},
			"page",
		);
		expect(name).toBe("share_failed");
		expect(properties).toEqual({
			resource_kind: "page",
			user_count: 2,
			team_count: 1,
			email_count: 1,
			error_category: "other",
		});
		expect(JSON.stringify(properties)).not.toContain("someone@example.com");
	});
});

describe("shareErrorCategory", () => {
	it.each([
		["Rate limit exceeded. Max 10 invitations per hour.", "rate_limit"],
		[
			"Free plan is limited to 1 user. Upgrade to add more members.",
			"free_plan",
		],
		[
			"You can only share with people and teams in this organization",
			"not_in_organization",
		],
		["That invitation is no longer pending", "invitation_not_pending"],
		["Only the owner can change who this is shared with", "not_owner"],
		["Failed to fetch", "network"],
		["Network request failed", "network"],
		["Something unexpected", "other"],
		["", "other"],
	] as const)("%p -> %p", (message, category) => {
		expect(shareErrorCategory(message)).toBe(category);
	});
});
