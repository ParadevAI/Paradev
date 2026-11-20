import { db } from "@superset/db/client";
import * as authSchema from "@superset/db/schema/auth";
import type { PlanTier } from "@superset/shared/billing";
import { AutumnError } from "autumn-js";
import { eq } from "drizzle-orm";
import { getAutumnCustomer } from "./customer";
import { tierFromFlags } from "./entitlements";

type Flags = Parameters<typeof tierFromFlags>[0];

/** The tier to store, or null when Autumn could not be read and the stored tier must stay. */
export async function planTierToRecord(
	read: () => Promise<{ flags: Flags }>,
): Promise<PlanTier | null> {
	try {
		return tierFromFlags((await read()).flags);
	} catch (error) {
		if (error instanceof AutumnError && error.statusCode === 404) return "free";
		console.error("[billing/plan-tier] Autumn read failed", error);
		return null;
	}
}

export async function writePlanTier(
	organizationId: string,
	planTier: PlanTier,
): Promise<void> {
	await db
		.update(authSchema.organizations)
		.set({ planTier })
		.where(eq(authSchema.organizations.id, organizationId));
}

/**
 * Stores the tier Autumn grants on the organization. The `subscriptions` rows
 * hold only plans with a Stripe subscription behind them, so a plan granted in
 * Autumn alone is recorded nowhere else for SQL readers.
 */
export async function recordPlanTier(organizationId: string): Promise<void> {
	const planTier = await planTierToRecord(() =>
		getAutumnCustomer(organizationId),
	);
	if (planTier) await writePlanTier(organizationId, planTier);
}
