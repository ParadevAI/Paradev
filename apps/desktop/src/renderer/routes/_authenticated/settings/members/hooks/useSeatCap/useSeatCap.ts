import { finiteSeatLimit } from "@superset/shared/billing";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * The plan's member cap and how much of it is taken. Pending invitations
 * count, as they do on the server, so a full organization cannot invite.
 */
export function useSeatCap() {
	const { activePlan } = useCurrentPlan();
	const { data: members } = cloudTrpc.organization.listMembers.useQuery({
		includeDeactivated: true,
	});
	const { data: invitations } =
		cloudTrpc.organization.listInvitations.useQuery(undefined);

	const limit = finiteSeatLimit(activePlan?.seatLimit);
	const used = (members ?? []).filter(
		(member) => !member.user.deletionRequestedAt,
	).length;
	const now = Date.now();
	const pending = (invitations ?? []).filter(
		(invitation) => new Date(invitation.expiresAt).getTime() > now,
	).length;
	const loaded = members !== undefined && invitations !== undefined;

	return {
		limit,
		used,
		atLimit: limit !== null && loaded && used + pending >= limit,
	};
}
