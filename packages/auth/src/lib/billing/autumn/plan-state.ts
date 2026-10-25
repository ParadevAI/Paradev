import type { MachineSize, PlanTier } from "@superset/shared/billing";
import { AutumnError } from "autumn-js";
import { billingFromCustomer, type OrganizationBilling } from "./billing-state";
import { seatLicenseFor } from "./catalog";
import { getAutumnCustomer } from "./customer";
import { paidPlanIdFromFlags } from "./entitlements";
import type { EnvironmentLimit } from "./environment-limit";
import { billingRedis } from "./redis";

const MEMORY_TTL_MS = 10_000;
const SHARED_TTL_SECONDS = 60;
const LAST_KNOWN_TTL_SECONDS = 24 * 60 * 60;
const AUTUMN_READ_TIMEOUT_MS = 2_000;

const FREE: OrganizationBilling = {
	tier: "free",
	autumnPlanId: null,
	status: null,
	cancelAt: null,
	scheduledPlanId: null,
	scheduledAt: null,
	periodStart: null,
	periodEnd: null,
	billingInterval: null,
	lapsed: false,
	paymentState: { kind: "ok" },
	cloudUsage: null,
	planTier: "free",
	gatedMachineSizes: [],
	environmentLimit: 0,
};

const FAIL_OPEN: OrganizationBilling = {
	tier: "pro",
	autumnPlanId: null,
	status: "active",
	cancelAt: null,
	scheduledPlanId: null,
	scheduledAt: null,
	periodStart: null,
	periodEnd: null,
	billingInterval: null,
	lapsed: false,
	paymentState: { kind: "ok" },
	cloudUsage: null,
	planTier: "pro",
	gatedMachineSizes: [],
	environmentLimit: null,
};

const memory = new Map<
	string,
	{ value: OrganizationBilling; expiresAt: number }
>();

function sharedKey(organizationId: string): string {
	return `billing:org:${organizationId}`;
}

function lastKnownKey(organizationId: string): string {
	return `billing:org:${organizationId}:last`;
}

async function readShared(key: string): Promise<OrganizationBilling | null> {
	try {
		const value = await billingRedis.get<OrganizationBilling>(key);
		if (!value) return value;
		return {
			...value,
			planTier: value.planTier ?? value.tier,
			scheduledPlanId: value.scheduledPlanId ?? null,
			scheduledAt: value.scheduledAt ?? null,
			environmentLimit:
				value.environmentLimit !== undefined
					? value.environmentLimit
					: value.tier === "free"
						? 0
						: null,
		};
	} catch (error) {
		console.error("[billing/plan-state] cache read failed", error);
		return null;
	}
}

async function fetchBilling(
	organizationId: string,
): Promise<OrganizationBilling> {
	try {
		const customer = await getAutumnCustomer(organizationId, {
			timeoutMs: AUTUMN_READ_TIMEOUT_MS,
		});
		const planId = paidPlanIdFromFlags(customer.flags);
		const license = planId
			? await seatLicenseFor(planId).catch((error) => {
					console.error("[billing/plan-state] catalog read failed", error);
					return null;
				})
			: null;
		return billingFromCustomer(
			customer,
			Date.now(),
			license?.price?.interval ?? null,
		);
	} catch (error) {
		if (error instanceof AutumnError && error.statusCode === 404) return FREE;
		throw error;
	}
}

export async function organizationBilling(
	organizationId: string,
): Promise<OrganizationBilling> {
	const cached = memory.get(organizationId);
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	const shared = await readShared(sharedKey(organizationId));
	if (shared) {
		memory.set(organizationId, {
			value: shared,
			expiresAt: Date.now() + MEMORY_TTL_MS,
		});
		return shared;
	}
	try {
		const value = await fetchBilling(organizationId);
		memory.set(organizationId, {
			value,
			expiresAt: Date.now() + MEMORY_TTL_MS,
		});
		await billingRedis
			.pipeline()
			.set(sharedKey(organizationId), value, { ex: SHARED_TTL_SECONDS })
			.set(lastKnownKey(organizationId), value, { ex: LAST_KNOWN_TTL_SECONDS })
			.exec()
			.catch((error) =>
				console.error("[billing/plan-state] cache write failed", error),
			);
		return value;
	} catch (error) {
		const lastKnown = await readShared(lastKnownKey(organizationId));
		console.error(
			`[billing/plan-state] Autumn unavailable for ${organizationId}; serving ${lastKnown ? "last known" : "fail-open"} state`,
			error,
		);
		const fallback = lastKnown
			? { ...lastKnown, gatedMachineSizes: [], environmentLimit: null }
			: FAIL_OPEN;
		memory.set(organizationId, {
			value: fallback,
			expiresAt: Date.now() + MEMORY_TTL_MS,
		});
		return fallback;
	}
}

export async function organizationPlanFromAutumn(
	organizationId: string,
): Promise<PlanTier> {
	return (await organizationBilling(organizationId)).tier;
}

export async function organizationGatedMachineSizesFromAutumn(
	organizationId: string,
): Promise<MachineSize[]> {
	return (await organizationBilling(organizationId)).gatedMachineSizes ?? [];
}

export async function organizationEnvironmentLimitFromAutumn(
	organizationId: string,
): Promise<EnvironmentLimit> {
	return (await organizationBilling(organizationId)).environmentLimit ?? null;
}

export async function invalidateOrganizationBilling(
	organizationId: string,
): Promise<void> {
	memory.delete(organizationId);
	await billingRedis
		.del(sharedKey(organizationId))
		.catch((error) =>
			console.error("[billing/plan-state] cache invalidate failed", error),
		);
}
