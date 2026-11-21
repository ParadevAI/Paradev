import type { OrganizationRole } from "@superset/shared/auth";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface OrganizationMembership {
	/** undefined while the member list loads or after it failed, null when the user is not a member. */
	role: OrganizationRole | null | undefined;
	isError: boolean;
	refetch: () => void;
}

/**
 * The signed-in user's membership in this window's organization. Reads the
 * member list for the window's org, not the session's active organization —
 * the session holds one org for every window at once, and the member list is
 * scoped server-side by the organization header this window sends.
 */
export function useOrganizationMembership(): OrganizationMembership {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;
	const members = cloudTrpc.organization.listMembers.useQuery(
		{ includeDeactivated: false },
		{ enabled: Boolean(userId) },
	);
	const role =
		members.data && userId
			? ((members.data.find((member) => member.userId === userId)?.role as
					| OrganizationRole
					| undefined) ?? null)
			: undefined;
	return {
		role,
		isError: members.isError,
		refetch: () => void members.refetch(),
	};
}
