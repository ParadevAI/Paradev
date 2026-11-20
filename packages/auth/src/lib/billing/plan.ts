import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import {
	ACTIVE_SUBSCRIPTION_STATUSES,
	type PlanTier,
} from "@superset/shared/billing";
import { and, desc, inArray } from "drizzle-orm";
import { billingUsesAutumn } from "../../autumn";
import { organizationPlanFromAutumn } from "./autumn/plan-state";
import { readOrganizationPlans } from "./plan-reader";

export function organizationPlans(
	organizationIds: string[],
): Promise<Map<string, PlanTier>> {
	return readOrganizationPlans(organizationIds, {
		usesAutumn: billingUsesAutumn,
		autumnPlan: organizationPlanFromAutumn,
		legacySubscriptions: (ids) =>
			db
				.select({
					organizationId: subscriptions.referenceId,
					plan: subscriptions.plan,
					status: subscriptions.status,
				})
				.from(subscriptions)
				.where(
					and(
						inArray(subscriptions.referenceId, ids),
						inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
					),
				)
				.orderBy(desc(subscriptions.createdAt)),
	});
}

export async function organizationPlan(
	organizationId: string,
): Promise<PlanTier> {
	return (
		(await organizationPlans([organizationId])).get(organizationId) ?? "free"
	);
}
