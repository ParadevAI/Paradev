import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { PAID_PLAN_TIERS } from "@superset/shared/billing";
import { and, eq, gt, inArray, sql } from "drizzle-orm";

export async function organizationsInIntegrationGrace(
	organizationIds: string[],
): Promise<Set<string>> {
	if (organizationIds.length === 0) return new Set();
	// Cancellation history keeps the existing seven-day retention policy; it is not current plan state.
	const rows = await db
		.select({ id: subscriptions.referenceId })
		.from(subscriptions)
		.where(
			and(
				inArray(subscriptions.referenceId, organizationIds),
				inArray(subscriptions.plan, [...PAID_PLAN_TIERS]),
				eq(subscriptions.status, "canceled"),
				gt(
					sql`coalesce(${subscriptions.endedAt}, ${subscriptions.periodEnd}, ${subscriptions.updatedAt})`,
					sql`now() - interval '7 days'`,
				),
			),
		);
	return new Set(rows.map((row) => row.id));
}
