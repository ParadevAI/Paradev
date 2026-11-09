import { getInvitableRoles } from "@superset/shared/auth";
import { isPaidPlanTier } from "@superset/shared/billing";
import { type ShareResourceKind, shareUiEvent } from "@superset/shared/sharing";
import { type InviteNewMode, shareDirectory } from "@superset/ui/share-access";
import { useCallback, useMemo } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useOrganizationRole } from "renderer/routes/_authenticated/hooks/useOrganizationRole";

/**
 * Everything a share popover needs from the window's organization: who can be
 * found, whether new people can be invited, and how to invite them.
 */
export function useShareDirectory() {
	const { data: session } = authClient.useSession();
	const organizationId = useActiveOrganizationId();
	const { data: organizations } =
		cloudTrpc.organization.list.useQuery(undefined);
	const { data: members } = cloudTrpc.organization.listMembers.useQuery({
		includeDeactivated: false,
	});
	const { data: teams } = cloudTrpc.organization.listTeams.useQuery();
	const role = useOrganizationRole();
	const { plan, isReady } = useCurrentPlan();
	const { gateFeature } = usePaywall();
	const utils = cloudTrpc.useUtils();

	const directory = useMemo(
		() => shareDirectory(members, teams),
		[members, teams],
	);

	const inviteNew: InviteNewMode =
		isReady && !isPaidPlanTier(plan)
			? "upgrade"
			: role && getInvitableRoles(role).includes("member")
				? "allowed"
				: "admins-only";

	const onUpgrade = useCallback(() => {
		gateFeature(GATED_FEATURES.INVITE_MEMBERS, () => {});
	}, [gateFeature]);

	/**
	 * Invites each email to the organization, reusing a pending invite, and
	 * returns the invitation ids. Pass the resource being shared to record each
	 * invitation as created by a share; a resend passes nothing.
	 */
	const inviteEmails = useCallback(
		async (
			emails: string[],
			sharing?: ShareResourceKind,
		): Promise<string[]> => {
			const ids: string[] = [];
			for (const email of emails) {
				const { data, error } = await authClient.organization.inviteMember({
					organizationId: organizationId ?? undefined,
					email,
					role: "member",
					resend: true,
				});
				if (error || !data) {
					throw new Error(error?.message ?? `Could not invite ${email}`);
				}
				ids.push(data.id);
				if (sharing) {
					track(
						...shareUiEvent(
							{ type: "invite_created", invitationId: data.id },
							sharing,
						),
					);
				}
			}
			if (ids.length) void utils.organization.listInvitations.invalidate();
			return ids;
		},
		[organizationId, utils],
	);

	return {
		directory,
		currentUserId: session?.user?.id ?? null,
		organizationName:
			organizations?.find((org) => org.id === organizationId)?.name ?? "",
		organizationLogo:
			organizations?.find((org) => org.id === organizationId)?.logo ?? null,
		inviteNew,
		onUpgrade,
		inviteEmails,
	};
}
