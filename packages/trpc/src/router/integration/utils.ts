import { findOrgMembership } from "@superset/db/utils";
import { userError } from "../../i18n-error";

export async function verifyOrgMembership(
	userId: string,
	organizationId: string,
	database?: Parameters<typeof findOrgMembership>[1],
) {
	const membership = await findOrgMembership(
		{ userId, organizationId },
		database,
	);

	if (!membership) {
		throw userError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
			i18nKey: "serverError.integration.notAMemberOfThisOrganization",
		});
	}

	return { membership };
}

export async function verifyOrgAdmin(userId: string, organizationId: string) {
	const { membership } = await verifyOrgMembership(userId, organizationId);

	if (membership.role !== "admin" && membership.role !== "owner") {
		throw userError({
			code: "FORBIDDEN",
			message: "Admin access required",
			i18nKey: "serverError.integration.adminAccessRequired",
		});
	}

	return { membership };
}

export async function verifyOrgOwner(userId: string, organizationId: string) {
	const { membership } = await verifyOrgMembership(userId, organizationId);

	if (membership.role !== "owner") {
		throw userError({
			code: "FORBIDDEN",
			message: "Only owners can delete projects",
			i18nKey: "serverError.integration.onlyOwnersCanDeleteProjects",
		});
	}

	return { membership };
}
