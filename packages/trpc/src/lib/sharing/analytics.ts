import type { ApiClientInfo } from "../../trpc";
import { posthog } from "../analytics";
import type { GranteeRef } from "./schema";
import type { ShareTarget } from "./service";

/**
 * One `resource_shared` per share action, on the sharer's timeline. Shares to an
 * invitation carry its id, which joins to `invitation_sent` and
 * `invitation_accepted` — the database loses that link once the invite is
 * accepted, so this is the durable record of which invites came from sharing.
 *
 * Never throws: sharing must not fail because analytics did.
 */
export function captureResourceShared({
	target,
	organizationId,
	sharedByUserId,
	added,
	role,
	client,
}: {
	target: ShareTarget;
	organizationId: string;
	sharedByUserId: string;
	added: GranteeRef[];
	role?: string;
	client: ApiClientInfo | null;
}): void {
	if (!added.length) return;
	try {
		const invitationIds = added.flatMap((g) =>
			g.kind === "invitation" ? [g.invitationId] : [],
		);
		posthog.capture({
			distinctId: sharedByUserId,
			event: "resource_shared",
			properties: {
				resource_kind: target.kind === "page" ? "page" : "cloud_workspace",
				resource_id: target.id,
				organization_id: organizationId,
				role: role ?? null,
				// Desktop, mobile, CLI and SDK send a client header; the web app does
				// not, so a missing header is the web app or an unidentified caller.
				client_product: client?.product ?? "web",
				user_count: added.filter((g) => g.kind === "user").length,
				team_count: added.filter((g) => g.kind === "team").length,
				invitation_count: invitationIds.length,
				invitation_ids: invitationIds,
			},
			groups: { organization: organizationId },
		});
	} catch (error) {
		console.error(
			"[sharing-analytics] Failed to capture resource_shared:",
			error,
		);
	}
}
