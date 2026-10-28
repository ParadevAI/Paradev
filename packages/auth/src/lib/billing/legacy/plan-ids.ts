import {
	type AutumnCatalogPlan,
	PLAN_METADATA,
	type PlanTier,
	planCatalogFromAutumn,
} from "@superset/shared/billing";

/**
 * @deprecated Plan ids only translate what released desktops send to
 * `/subscription/upgrade`; new clients pick plans from Autumn.
 */
// TODO(2027-01-31): drop; desktops before the first build on /api/auth/autumn/* send { plan: "pro", annual }.
export const PRO_MONTHLY_PLAN_ID = "pro";
/** @deprecated See PRO_MONTHLY_PLAN_ID. */
export const PRO_ANNUAL_PLAN_ID = "pro_annual";

/**
 * @deprecated The only plans released clients know. A client that sends no
 * `currentPlanId` is one of them and must not change any other plan.
 */
// TODO(2027-01-31): drop with the desktops that predate currentPlanId.
export const LEGACY_CLIENT_PLAN_IDS: readonly string[] = [
	PRO_MONTHLY_PLAN_ID,
	PRO_ANNUAL_PLAN_ID,
];

/** @deprecated See PRO_MONTHLY_PLAN_ID. */
export function autumnPlanIdFor(annual: boolean): string {
	return annual ? PRO_ANNUAL_PLAN_ID : PRO_MONTHLY_PLAN_ID;
}

/**
 * @deprecated Released desktops send the retired `pro` and `pro_annual` ids;
 * a purchase gets the plan the Pro family sells today.
 */
// TODO(2027-01-31): drop with the desktops that hardcode autumnProPlanId.
export function currentPlanIdForLegacy(
	planId: string,
	plans: AutumnCatalogPlan[],
): string {
	if (!LEGACY_CLIENT_PLAN_IDS.includes(planId)) return planId;
	const pro = planCatalogFromAutumn(plans).find(
		(family) => family.family === "pro",
	);
	return (
		(planId === PRO_ANNUAL_PLAN_ID ? pro?.yearly : pro?.monthly)?.id ?? planId
	);
}

/**
 * @deprecated Released desktops know one Pro plan; they may switch its
 * interval, cancel and restore it, and must not touch any other plan.
 */
// TODO(2027-01-31): drop with the desktops that hardcode autumnProPlanId.
export function isProFamilyPlan(
	planId: string,
	plans: AutumnCatalogPlan[],
): boolean {
	if (LEGACY_CLIENT_PLAN_IDS.includes(planId)) return true;
	const plan = plans.find((candidate) => candidate.id === planId);
	return plan?.metadata?.[PLAN_METADATA.family] === "pro";
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
