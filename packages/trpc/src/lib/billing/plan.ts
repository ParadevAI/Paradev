import { billingUsesAutumn } from "@superset/auth/autumn";
import {
	organizationEnvironmentLimitFromAutumn,
	organizationGatedMachineSizesFromAutumn,
	organizationPlanFromAutumn,
} from "@superset/auth/billing";
import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import {
	ACTIVE_SUBSCRIPTION_STATUSES,
	DEFAULT_ENVIRONMENT_LIMIT,
	defaultMachineSize,
	isMachineSize,
	MACHINE_SIZE_VCPUS,
	type MachineSize,
	offeredMachineSizes,
	type PlanTier,
	planTierFromSubscription,
} from "@superset/shared/billing";
import { and, desc, eq, inArray } from "drizzle-orm";

/**
 * The org's plan as billing.activePlan resolves it: the newest subscription
 * in a paying status, else free. Unrecognized plan names read as free — the
 * gate must fail closed on a plan string this build doesn't know.
 */
export async function organizationPlan(
	organizationId: string,
): Promise<PlanTier> {
	if (billingUsesAutumn) return organizationPlanFromAutumn(organizationId);
	const [subscription] = await db
		.select({ plan: subscriptions.plan, status: subscriptions.status })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.referenceId, organizationId),
				inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
			),
		)
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	return planTierFromSubscription(subscription);
}

export interface OrganizationMachineSizes {
	sizes: MachineSize[];
	defaultSize: MachineSize;
}

/** Small, medium and large for everyone; bigger sizes only while Autumn turns them on. */
export async function organizationMachineSizes(
	organizationId: string,
): Promise<OrganizationMachineSizes> {
	const gated = billingUsesAutumn
		? await organizationGatedMachineSizesFromAutumn(organizationId)
		: [];
	const sizes = offeredMachineSizes(gated);
	return { sizes, defaultSize: defaultMachineSize(sizes) };
}

export async function resolveMachineSize(
	organizationId: string,
	requested: string | null | undefined,
): Promise<{ name: MachineSize; vcpus: number } | null> {
	const { sizes, defaultSize } = await organizationMachineSizes(organizationId);
	const name = requested ?? defaultSize;
	if (!isMachineSize(name) || !sizes.includes(name)) return null;
	return { name, vcpus: MACHINE_SIZE_VCPUS[name] };
}

/**
 * Environments the org may hold: the plan's `environments` feature in Autumn,
 * `Infinity` when that is unlimited, and DEFAULT_ENVIRONMENT_LIMIT while the
 * plan carries no such feature or billing is not on Autumn.
 */
export async function organizationEnvironmentLimit(
	organizationId: string,
): Promise<number> {
	const limit = billingUsesAutumn
		? await organizationEnvironmentLimitFromAutumn(organizationId)
		: null;
	if (limit === "unlimited") return Number.POSITIVE_INFINITY;
	return limit ?? DEFAULT_ENVIRONMENT_LIMIT;
}
