import { differenceInDays } from "date-fns";

/**
 * Whether the subscription bills yearly, or null when there is nothing to read
 * it from — no subscription yet, or a row predating `billingInterval`, where
 * the period length is the only signal.
 */
export function resolveSubscriptionIsYearly(activePlan: {
	billingInterval?: string | null;
	periodStart?: Date | null;
	periodEnd?: Date | null;
}): boolean | null {
	const interval = activePlan.billingInterval;
	if (interval === "year" || interval === "yearly") return true;
	if (interval === "month" || interval === "monthly") return false;

	if (activePlan.periodStart && activePlan.periodEnd) {
		return (
			differenceInDays(
				new Date(activePlan.periodEnd),
				new Date(activePlan.periodStart),
			) > 60
		);
	}

	return null;
}
