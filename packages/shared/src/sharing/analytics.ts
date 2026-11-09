export type ShareResourceKind = "page" | "cloud_workspace";

/** What a share dialog reports about itself. */
export type ShareUiEvent =
	| { type: "opened" }
	| { type: "closed"; shared: boolean }
	| { type: "invite_created"; invitationId: string };

/**
 * The event name and properties for a share dialog event, the same in every
 * app: `track(...shareUiEvent(event, "page"))`.
 */
export function shareUiEvent(
	event: ShareUiEvent,
	resourceKind: ShareResourceKind,
): [name: string, properties: Record<string, string | boolean>] {
	switch (event.type) {
		case "opened":
			return ["share_dialog_opened", { resource_kind: resourceKind }];
		case "closed":
			return [
				"share_dialog_closed",
				{ resource_kind: resourceKind, shared: event.shared },
			];
		case "invite_created":
			return [
				"share_invite_created",
				{ resource_kind: resourceKind, invitation_id: event.invitationId },
			];
	}
}
