const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = 30;

/**
 * A billing period when the organization has one; otherwise the last 30 UTC days, today
 * included. The window ends at the next UTC midnight, so it stays the same all day.
 */
export function usageRange(
	period: { id: string } | undefined,
	now = new Date(),
) {
	if (period) return { period: period.id };
	const to = (Math.floor(now.getTime() / DAY_MS) + 1) * DAY_MS;
	return {
		from: new Date(to - DAYS * DAY_MS).toISOString(),
		to: new Date(to).toISOString(),
	};
}
