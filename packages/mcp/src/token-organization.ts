import { ORGANIZATION_HEADER } from "@superset/shared/constants";

export class TokenOrganizationError extends Error {}

export function tokenOrganizationId(
	payload: Record<string, unknown>,
	requestedOrganizationId: string | null,
): string {
	if (typeof payload.organizationId === "string" && payload.organizationId) {
		return payload.organizationId;
	}

	const organizationIds = Array.isArray(payload.organizationIds)
		? payload.organizationIds.filter(
				(id): id is string => typeof id === "string" && id.length > 0,
			)
		: [];
	if (organizationIds.length === 0) {
		throw new TokenOrganizationError(
			"OAuth token missing organizationId claim",
		);
	}

	if (requestedOrganizationId) {
		if (!organizationIds.includes(requestedOrganizationId)) {
			throw new TokenOrganizationError(
				`Token does not cover organization ${requestedOrganizationId}, which was asked for in the ${ORGANIZATION_HEADER} header`,
			);
		}
		return requestedOrganizationId;
	}

	const [only] = organizationIds;
	if (organizationIds.length === 1 && only) return only;
	throw new TokenOrganizationError(
		`Token covers ${organizationIds.length} organizations; name one in the ${ORGANIZATION_HEADER} header`,
	);
}
