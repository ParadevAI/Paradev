import { findOrgMembership } from "@superset/db/utils";
import { notFound } from "next/navigation";
import { cloudUsageEnabled } from "../../../utils/cloudUsageEnabled";
import { requireSession } from "../../../utils/requireSession";
import { CloudUsageSettings } from "./components/CloudUsageSettings";

export default async function CloudUsagePage() {
	const session = await requireSession();
	const organizationId = session.session.activeOrganizationId;
	if (!organizationId || !(await cloudUsageEnabled())) notFound();
	const membership = await findOrgMembership({
		userId: session.user.id,
		organizationId,
	});
	if (!membership) notFound();

	return (
		<CloudUsageSettings
			key={organizationId}
			isAdmin={membership.role === "owner" || membership.role === "admin"}
			isOwner={membership.role === "owner"}
		/>
	);
}
