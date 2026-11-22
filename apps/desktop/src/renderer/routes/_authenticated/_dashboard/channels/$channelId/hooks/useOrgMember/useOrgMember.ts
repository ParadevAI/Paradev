import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** One person from the organization's member list, which the sidebar has already loaded. */
export function useOrgMember(userId: string) {
	const { data } = cloudTrpc.organization.listMembers.useQuery(undefined);
	return useMemo(
		() => data?.find((member) => member.user.id === userId) ?? null,
		[data, userId],
	);
}
