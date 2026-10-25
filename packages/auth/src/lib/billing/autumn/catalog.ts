import {
	type AutumnCatalogPlan,
	type AutumnRestPlan,
	catalogPlansFrom,
	fromAutumnRest,
	isSelfServeAutumnPlan,
	seatLicensePlan,
} from "@superset/shared/billing";
import { autumnRest } from "../../../autumn";
import { LEGACY_CLIENT_PLAN_IDS } from "../legacy/plan-ids";
import { billingRedis } from "./redis";

const MEMORY_TTL_MS = 60_000;
const SHARED_TTL_SECONDS = 5 * 60;
const LAST_KNOWN_TTL_SECONDS = 30 * 24 * 60 * 60;
const SHARED_KEY = "billing:catalog:v2";
const LAST_KNOWN_KEY = "billing:catalog:v2:last";

let memory: { plans: AutumnCatalogPlan[]; expiresAt: number } | null = null;

async function readShared(key: string): Promise<AutumnCatalogPlan[] | null> {
	try {
		return await billingRedis.get<AutumnCatalogPlan[]>(key);
	} catch (error) {
		console.error("[billing/catalog] cache read failed", error);
		return null;
	}
}

async function fetchAutumnPlans(): Promise<AutumnCatalogPlan[]> {
	const { list } = await autumnRest<{ list: AutumnRestPlan[] }>(
		"plans.list",
		{},
	);
	return catalogPlansFrom(list.map(fromAutumnRest), LEGACY_CLIENT_PLAN_IDS);
}

/**
 * The self-serve plans with their seat licenses and the retired plans
 * organizations still hold, served from the last good copy when Autumn fails.
 */
export async function catalogAutumnPlans(): Promise<AutumnCatalogPlan[]> {
	if (memory && memory.expiresAt > Date.now()) return memory.plans;
	const shared = await readShared(SHARED_KEY);
	if (shared) {
		memory = { plans: shared, expiresAt: Date.now() + MEMORY_TTL_MS };
		return shared;
	}
	try {
		const plans = await fetchAutumnPlans();
		memory = { plans, expiresAt: Date.now() + MEMORY_TTL_MS };
		await billingRedis
			.pipeline()
			.set(SHARED_KEY, plans, { ex: SHARED_TTL_SECONDS })
			.set(LAST_KNOWN_KEY, plans, { ex: LAST_KNOWN_TTL_SECONDS })
			.exec()
			.catch((error) =>
				console.error("[billing/catalog] cache write failed", error),
			);
		return plans;
	} catch (error) {
		const lastKnown = await readShared(LAST_KNOWN_KEY);
		if (!lastKnown) throw error;
		console.error(
			"[billing/catalog] Autumn unavailable; serving last known catalog",
			error,
		);
		return lastKnown;
	}
}

export async function isSelfServePlan(planId: string): Promise<boolean> {
	return (await catalogAutumnPlans()).some(
		(plan) => plan.id === planId && isSelfServeAutumnPlan(plan),
	);
}

/** The seat license a plan sells, or null when its seats are a feature quantity. */
export async function seatLicenseFor(
	planId: string,
): Promise<AutumnCatalogPlan | null> {
	const plans = await catalogAutumnPlans();
	const plan = plans.find((candidate) => candidate.id === planId);
	return plan ? seatLicensePlan(plan, plans) : null;
}
