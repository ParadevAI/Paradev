import {
	type AutumnCatalogPlan,
	PLAN_METADATA,
	type PlanTier,
	planCatalogFromAutumn,
} from "@superset/shared/billing";

export const PRO_MONTHLY_PLAN_ID = "pro";
/** @deprecated See PRO_MONTHLY_PLAN_ID. */
export const PRO_ANNUAL_PLAN_ID = "pro_annual";

export const LEGACY_CLIENT_PLAN_IDS: readonly string[] = [
	PRO_MONTHLY_PLAN_ID,
	PRO_ANNUAL_PLAN_ID,
];

/** @deprecated See PRO_MONTHLY_PLAN_ID. */
export function autumnPlanIdFor(annual: boolean): string {
	return annual ? PRO_ANNUAL_PLAN_ID : PRO_MONTHLY_PLAN_ID;
}

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

export function isProFamilyPlan(
	planId: string,
	plans: AutumnCatalogPlan[],
): boolean {
	if (LEGACY_CLIENT_PLAN_IDS.includes(planId)) return true;
	const plan = plans.find((candidate) => candidate.id === planId);
	return plan?.metadata?.[PLAN_METADATA.family] === "pro";
}

export function planFromStripePrice(
	priceId: string | undefined,
	prices: { pro: string[]; enterprise: string[] },
): Exclude<PlanTier, "free"> | null {
	if (!priceId) return null;
	if (prices.enterprise.includes(priceId)) return "enterprise";
	if (prices.pro.includes(priceId)) return "pro";
	return null;
}
