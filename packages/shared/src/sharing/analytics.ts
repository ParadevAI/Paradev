import type { ShareAddRequest } from "./types";

export type ShareResourceKind = "page" | "cloud_workspace";

/**
 * What a share dialog reports about itself. The server records what was
 * actually shared (`resource_shared`); these cover what it can't see: people
 * opening the dialog, leaving without sharing, and attempts that failed.
 */
export type ShareUiEvent =
	| { type: "opened" }
	| { type: "closed"; shared: boolean }
	| { type: "failed"; request: ShareAddRequest; error: string };

/** Flat values only, so every app's analytics client accepts them as-is. */
export type ShareUiEventProperties = Record<string, string | number | boolean>;

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
				properties: { resource_kind: resourceKind, shared: event.shared },
			};
		case "failed":
			// Counts only: the emails being invited stay out of analytics.
			return {
				name: "share_failed",
				properties: {
					resource_kind: resourceKind,
					user_count: event.request.grantees.filter((g) => g.kind === "user")
						.length,
					team_count: event.request.grantees.filter((g) => g.kind === "team")
						.length,
					email_count: event.request.emails.length,
					error: event.error,
				},
			};
	}
}
