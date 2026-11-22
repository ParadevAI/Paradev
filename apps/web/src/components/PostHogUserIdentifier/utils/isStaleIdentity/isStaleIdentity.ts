/**
 * The PostHog cookie is shared across *.superset.sh, so an anonymous id may
 * come from the marketing site and must survive until identify() merges it.
 * Only an identity that belongs to someone else is stale.
 */
export function isStaleIdentity({
	userId,
	distinctId,
	userState,
}: {
	userId: string | null;
	distinctId: string;
	userState: unknown;
}): boolean {
	return userState === "identified" && distinctId !== userId;
}
