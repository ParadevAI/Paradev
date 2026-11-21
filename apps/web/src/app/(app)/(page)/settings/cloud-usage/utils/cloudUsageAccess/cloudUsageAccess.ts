import { findOrgMembership } from "@superset/db/utils";
import { notFound } from "next/navigation";
import { cloudUsageEnabled } from "../../../../../utils/cloudUsageEnabled";
import { requireSession } from "../../../../../utils/requireSession";

/** The signed-in member's view of the cloud usage pages; not found while the flag is off. */
export async function cloudUsageAccess() {
	const session = await requireSession();
	const organizationId = session.session.activeOrganizationId;
	if (!organizationId || !(await cloudUsageEnabled())) notFound();
	const membership = await findOrgMembership({
		userId: session.user.id,
		organizationId,
	});
	if (!membership) notFound();
	return {
		organizationId,
		isAdmin: membership.role === "owner" || membership.role === "admin",
	};
}
