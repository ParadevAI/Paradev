/** The one organization a bearer's token was minted for; null for other credentials. */
export function boundOrganizationId(
	session: { session: object } | null,
): string | null {
	const id = (session?.session as { boundOrganizationId?: unknown } | undefined)
		?.boundOrganizationId;
	return typeof id === "string" ? id : null;
}

/**
 * The organizations a session lists. Trusted to say yes, so a removal can lag
 * by a bearer token's lifetime (an hour).
 */
export function tokenOrganizationIds(
	session: { session: object } | null,
): string[] | null {
	const ids = (session?.session as { organizationIds?: unknown } | undefined)
		?.organizationIds;
	return Array.isArray(ids)
		? ids.filter((id): id is string => typeof id === "string")
		: null;
}
