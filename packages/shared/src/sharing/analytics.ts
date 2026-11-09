import type { ShareAddRequest } from "./types";

export type ShareResourceKind = "page" | "cloud_workspace";

/**
 * What a share dialog reports about itself. The server records what was
 * actually shared (`resource_shared`); these cover what only the dialog knows:
 * people opening it and leaving, attempts that failed, and which invitations it
 * created (so an accepted invitation can be traced back to a share).
 */
export type ShareUiEvent =
	| { type: "opened" }
	| { type: "closed"; shared: boolean; canManage: boolean }
	| { type: "invite_created"; invitationId: string }
	| { type: "failed"; request: ShareAddRequest; error: string };

/** Flat values only, so every app's analytics client accepts them as-is. */
export type ShareUiEventProperties = Record<string, string | number | boolean>;

export type ShareErrorCategory =
	| "rate_limit"
	| "free_plan"
	| "not_in_organization"
	| "invitation_not_pending"
	| "not_owner"
	| "network"
	| "other";

/**
 * Buckets a raw error message from a failed share. Analytics gets the bucket,
 * never the message: some messages name the email being invited.
 */
export function shareErrorCategory(message: string): ShareErrorCategory {
	const text = message.toLowerCase();
	if (text.includes("rate limit")) return "rate_limit";
	if (text.includes("free plan") || text.includes("paid plan")) {
		return "free_plan";
	}
	if (text.includes("in this organization")) return "not_in_organization";
	if (text.includes("no longer pending")) return "invitation_not_pending";
	if (text.includes("only the owner")) return "not_owner";
	if (
		text.includes("failed to fetch") ||
		text.includes("network request failed") ||
		text.includes("networkerror")
	) {
		return "network";
	}
	return "other";
}

/** One event name and property shape for every app, so funnels combine across them. */
export function shareUiEventPayload(
	event: ShareUiEvent,
	resourceKind: ShareResourceKind,
): { name: string; properties: ShareUiEventProperties } {
	switch (event.type) {
		case "opened":
			return {
				name: "share_dialog_opened",
				properties: { resource_kind: resourceKind },
			};
		case "closed":
			return {
				name: "share_dialog_closed",
				properties: {
					resource_kind: resourceKind,
					shared: event.shared,
					can_manage: event.canManage,
				},
			};
		case "invite_created":
			return {
				name: "share_invite_created",
				properties: {
					resource_kind: resourceKind,
					invitation_id: event.invitationId,
				},
			};
		case "failed":
			// Counts and a category only: the emails being invited stay out.
			return {
				name: "share_failed",
				properties: {
					resource_kind: resourceKind,
					user_count: event.request.grantees.filter((g) => g.kind === "user")
						.length,
					team_count: event.request.grantees.filter((g) => g.kind === "team")
						.length,
					email_count: event.request.emails.length,
					error_category: shareErrorCategory(event.error),
				},
			};
	}
}
