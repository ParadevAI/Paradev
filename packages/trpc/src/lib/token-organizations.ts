/**
 * A bearer's organizations as its token listed them. Trusted to say yes, so a
 * removal can lag by the token's lifetime (an hour). Null for a cookie session.
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
