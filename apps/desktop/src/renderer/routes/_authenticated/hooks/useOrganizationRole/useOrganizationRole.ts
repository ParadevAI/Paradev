import type { OrganizationRole } from "@superset/shared/auth";
import { useOrganizationMembership } from "renderer/hooks/useOrganizationMembership";

/** The signed-in user's role in this window's organization; null while loading or when not a member. */
export function useOrganizationRole(): OrganizationRole | null {
	return useOrganizationMembership().role ?? null;
}
