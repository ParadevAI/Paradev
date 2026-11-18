import { getRoleLevel } from "@superset/shared/auth";
import { useOrganizationMembership } from "renderer/hooks/useOrganizationMembership";

/** undefined while the membership is loading. */
export function useIsOrganizationAdmin(): boolean | undefined {
	const { role } = useOrganizationMembership();
	if (role === undefined) return undefined;
	return role !== null && getRoleLevel(role) >= getRoleLevel("admin");
}
