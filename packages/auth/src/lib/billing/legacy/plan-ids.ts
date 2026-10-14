import type { PlanTier } from "@superset/shared/billing";

/**
 * @deprecated Plan ids only translate what released desktops send to
 * `/subscription/upgrade`; new clients pick plans from Autumn.
 */
// TODO(2027-01-31): drop; desktops before the first build on /api/auth/autumn/* send { plan: "pro", annual }.
export const PRO_MONTHLY_PLAN_ID = "pro";
/** @deprecated See PRO_MONTHLY_PLAN_ID. */
export const PRO_ANNUAL_PLAN_ID = "pro_annual";

/** @deprecated See PRO_MONTHLY_PLAN_ID. */
export function autumnPlanIdFor(annual: boolean): string {
	return annual ? PRO_ANNUAL_PLAN_ID : PRO_MONTHLY_PLAN_ID;
}

/**
 * @deprecated Reads a tier from a Stripe price for subscriptions Autumn has
 * not imported yet.
 */
// TODO(2027-01-31): drop; once the flip to Autumn is verified, every subscription has Autumn flags.
export function planFromStripePrice(
	priceId: string | undefined,
	prices: { pro: string[]; enterprise: string[] },
): Exclude<PlanTier, "free"> | null {
	if (!priceId) return null;
	if (prices.enterprise.includes(priceId)) return "enterprise";
	if (prices.pro.includes(priceId)) return "pro";
	return null;
}
