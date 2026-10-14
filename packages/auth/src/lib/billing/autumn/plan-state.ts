import type { PlanTier } from "@superset/shared/billing";
import { Redis } from "@upstash/redis";
import { AutumnError } from "autumn-js";
import { env } from "../../../env";
import { billingFromCustomer, type OrganizationBilling } from "./billing-state";
import { getAutumnCustomer } from "./customer";

const MEMORY_TTL_MS = 10_000;
const SHARED_TTL_SECONDS = 60;
const LAST_KNOWN_TTL_SECONDS = 24 * 60 * 60;

const FREE: OrganizationBilling = {
	tier: "free",
	status: null,
	cancelAt: null,
	periodStart: null,
	periodEnd: null,
	billingInterval: null,
	lapsed: false,
	paymentState: { kind: "ok" },
};

const FAIL_OPEN: OrganizationBilling = {
	tier: "pro",
	status: "active",
	cancelAt: null,
	periodStart: null,
	periodEnd: null,
	billingInterval: null,
	lapsed: false,
	paymentState: { kind: "ok" },
};

const redis = new Redis({
	url: env.KV_REST_API_URL,
	token: env.KV_REST_API_TOKEN,
});
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
		return await redis.get<OrganizationBilling>(key);
	} catch (error) {
		console.error("[billing/plan-state] cache read failed", error);
		return null;
	}
}

async function fetchBilling(
	organizationId: string,
): Promise<OrganizationBilling> {
	try {
		return billingFromCustomer(
			await getAutumnCustomer(organizationId),
			Date.now(),
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
		await redis
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
		return lastKnown ?? FAIL_OPEN;
	}
}

export async function organizationPlanFromAutumn(
	organizationId: string,
): Promise<PlanTier> {
	return (await organizationBilling(organizationId)).tier;
}

export async function invalidateOrganizationBilling(
	organizationId: string,
): Promise<void> {
	memory.delete(organizationId);
	await redis
		.del(sharedKey(organizationId))
		.catch((error) =>
			console.error("[billing/plan-state] cache invalidate failed", error),
		);
}
