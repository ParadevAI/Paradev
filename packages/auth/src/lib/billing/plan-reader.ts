import {
	type PlanTier,
	planTierFromSubscription,
} from "@superset/shared/billing";

interface PlanSources {
	usesAutumn: boolean;
	autumnPlan: (organizationId: string) => Promise<PlanTier>;
	legacySubscriptions: (organizationIds: string[]) => Promise<
		Array<{
			organizationId: string;
			plan: string;
			status: string;
		}>
	>;
}

const BILLING_READ_CONCURRENCY = 10;

export async function readOrganizationPlans(
	organizationIds: string[],
	sources: PlanSources,
): Promise<Map<string, PlanTier>> {
	const ids = [...new Set(organizationIds)];
	const plans = new Map<string, PlanTier>(ids.map((id) => [id, "free"]));
	if (ids.length === 0) return plans;
	if (sources.usesAutumn) {
		for (let i = 0; i < ids.length; i += BILLING_READ_CONCURRENCY) {
			const batch = ids.slice(i, i + BILLING_READ_CONCURRENCY);
			const tiers = await Promise.all(batch.map(sources.autumnPlan));
			for (const [index, id] of batch.entries())
				plans.set(id, tiers[index] ?? "free");
		}
		return plans;
	}
	const rows = await sources.legacySubscriptions(ids);
	const seen = new Set<string>();
	for (const row of rows) {
		if (seen.has(row.organizationId)) continue;
		seen.add(row.organizationId);
		plans.set(row.organizationId, planTierFromSubscription(row));
	}
	return plans;
}
