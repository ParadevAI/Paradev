const UNKNOWN_LIMIT = `We could not confirm your plan's member limit. Try again in a few minutes, or contact support.`;

/**
 * Why one more member or invitation is refused, or null when the plan has room.
 * A null limit means the cap is unknown, so the add is refused.
 */
export function seatLimitRefusal(
	limit: number | null,
	occupied: number,
): string | null {
	if (limit === null) return UNKNOWN_LIMIT;
	if (occupied < limit) return null;
	return `Your plan allows up to ${limit} members. Upgrade to Team to add more.`;
}

/** Why a plan cannot be bought by an organization this size, or null when it fits. */
export function planSeatRefusal(
	limit: number | null,
	members: number,
): string | null {
	if (limit === null) return UNKNOWN_LIMIT;
	if (members <= limit) return null;
	return `This plan allows up to ${limit} members and your organization has ${members}. Remove members or choose Team.`;
}
