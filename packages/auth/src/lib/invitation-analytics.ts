import { posthog } from "./analytics";

type InvitationEvent = "invitation_sent" | "invitation_accepted";

/**
 * Both events land on the inviter's PostHog timeline, so a funnel of
 * `invitation_sent` → `invitation_accepted` works per person without any id
 * mapping. The invitee is recorded as a property instead.
 *
 * Never throws: an invite must not fail because analytics did.
 */
export async function captureInvitationEvent({
	event,
	inviterId,
	organizationId,
	invitationId,
	properties,
}: {
	event: InvitationEvent;
	inviterId: string;
	organizationId: string;
	invitationId: string;
	properties?: Record<string, unknown>;
}): Promise<void> {
	try {
		posthog.capture({
			distinctId: inviterId,
			event,
			properties: {
				...(properties ?? {}),
				invitation_id: invitationId,
				organization_id: organizationId,
			},
			groups: { organization: organizationId },
		});
		await posthog.flush();
	} catch (error) {
		console.error(`[invitation-analytics] Failed to capture ${event}:`, error);
	}
}
