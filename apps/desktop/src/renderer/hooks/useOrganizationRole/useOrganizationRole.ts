import type { OrganizationRole } from "@superset/shared/auth";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** undefined while the membership is loading, null when the user is not a member. */
export function useOrganizationRole(): OrganizationRole | null | undefined {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;
	const { data: members } = cloudTrpc.organization.listMembers.useQuery(
		undefined,
		{ enabled: Boolean(userId) },
	);
	if (!members || !userId) return undefined;
	const role = members.find((member) => member.userId === userId)?.role;
	return role ? (role as OrganizationRole) : null;
}
