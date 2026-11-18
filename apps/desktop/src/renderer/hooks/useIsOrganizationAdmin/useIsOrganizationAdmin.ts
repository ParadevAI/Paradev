import { getRoleLevel } from "@superset/shared/auth";
import { useOrganizationRole } from "renderer/hooks/useOrganizationRole";

/** undefined while the membership is loading. */
export function useIsOrganizationAdmin(): boolean | undefined {
	const role = useOrganizationRole();
	if (role === undefined) return undefined;
	return role !== null && getRoleLevel(role) >= getRoleLevel("admin");
}
