import { posthog } from "./analytics";

type OrgEvent =
	| "invitation_created"
	| "invitation_accepted"
	| "invitation_accept_failed"
	| "member_joined"
	| "seat_added"
	| "seat_removed";

/** How a person came to be in an organization. */
export type JoinMethod = "created_org" | "invite" | "domain" | "admin_add";

/**
 * Captures an organization event on `distinctId`'s timeline, with the
 * organization as a group so it can be broken down per organization.
 *
 * Never throws: invitations, membership and billing must not fail because
 * analytics did.
 */
export async function captureOrgEvent({
	event,
	distinctId,
	organizationId,
	properties,
}: {
	event: OrgEvent;
	distinctId: string;
	organizationId: string;
	properties?: Record<string, unknown>;
}): Promise<void> {
	try {
		posthog.capture({
			distinctId,
			event,
			properties: { ...(properties ?? {}), organization_id: organizationId },
			groups: { organization: organizationId },
		});
		await posthog.flush();
	} catch (error) {
		console.error(`[org-analytics] Failed to capture ${event}:`, error);
	}
}
