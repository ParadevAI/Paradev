import {
	addDays,
	billingDate,
	billingDayStart,
} from "../billingDay/billingDay";

const DAYS = 30;

/**
 * A billing period when the organization has one; otherwise the last 30 billing days, today
 * included. The window ends at the next Pacific midnight, so it stays the same all day.
 */
export function usageRange(
	period: { id: string } | undefined,
	now = new Date(),
) {
	if (period) return { period: period.id };
	const today = billingDate(now);
	return {
		from: billingDayStart(addDays(today, 1 - DAYS)).toISOString(),
		to: billingDayStart(addDays(today, 1)).toISOString(),
	};
}
