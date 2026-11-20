import { db } from "@superset/db/client";
import * as authSchema from "@superset/db/schema/auth";
import { PAID_PLAN_TIERS, type PlanTier } from "@superset/shared/billing";
import { inArray } from "drizzle-orm";
import { autumnClient } from "../src/autumn";
import { getAutumnCustomer } from "../src/lib/billing/autumn/customer";
import { tierFromFlags } from "../src/lib/billing/autumn/entitlements";
import {
	planTierToRecord,
	writePlanTier,
} from "../src/lib/billing/autumn/plan-tier";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 500;

const apply = process.argv.includes("--apply");

async function paidTiersInAutumn(): Promise<Map<string, PlanTier>> {
	const granted = new Map<string, PlanTier>();
	let cursor = "";
	do {
		const page = await autumnClient.customers.list({
			startCursor: cursor,
			limit: PAGE_SIZE,
		});
		for (const customer of page.list) {
			const tier = tierFromFlags(customer.flags);
			if (customer.id && UUID.test(customer.id) && tier !== "free") {
				granted.set(customer.id, tier);
			}
		}
		cursor = page.nextCursor ?? "";
	} while (cursor);
	return granted;
}

async function storedTiers(ids: string[]): Promise<Map<string, string | null>> {
	const stored = new Map<string, string | null>();
	for (let i = 0; i < ids.length; i += PAGE_SIZE) {
		const rows = await db
			.select({
				id: authSchema.organizations.id,
				planTier: authSchema.organizations.planTier,
			})
			.from(authSchema.organizations)
			.where(inArray(authSchema.organizations.id, ids.slice(i, i + PAGE_SIZE)));
		for (const row of rows) stored.set(row.id, row.planTier);
	}
	return stored;
}

/**
 * Sets `organizations.plan_tier` from Autumn: every organization Autumn grants
 * a paid tier, and every organization stored as paid that Autumn no longer
 * lists as paid. A dry run unless `--apply` is passed.
 */
async function main() {
	const granted = await paidTiersInAutumn();
	const stored = await storedTiers([...granted.keys()]);
	const counts = { set: 0, cleared: 0, unchanged: 0, missing: 0, unread: 0 };

	for (const [organizationId, tier] of granted) {
		if (!stored.has(organizationId)) {
			counts.missing += 1;
			continue;
		}
		if (stored.get(organizationId) === tier) {
			counts.unchanged += 1;
			continue;
		}
		counts.set += 1;
		console.log(
			`[plan-tiers] ${organizationId}: ${stored.get(organizationId) ?? "unset"} -> ${tier}`,
		);
		if (apply) await writePlanTier(organizationId, tier);
	}

	const storedPaid = await db
		.select({
			id: authSchema.organizations.id,
			planTier: authSchema.organizations.planTier,
		})
		.from(authSchema.organizations)
		.where(inArray(authSchema.organizations.planTier, [...PAID_PLAN_TIERS]));
	for (const row of storedPaid) {
		if (granted.has(row.id)) continue;
		const tier = await planTierToRecord(() => getAutumnCustomer(row.id));
		if (!tier) {
			counts.unread += 1;
			continue;
		}
		if (tier === row.planTier) {
			counts.unchanged += 1;
			continue;
		}
		counts.cleared += 1;
		console.log(`[plan-tiers] ${row.id}: ${row.planTier} -> ${tier}`);
		if (apply) await writePlanTier(row.id, tier);
	}

	console.log(
		`[plan-tiers] ${apply ? "set" : "would set"} ${counts.set}, ${apply ? "corrected" : "would correct"} ${counts.cleared}, unchanged ${counts.unchanged}, no organization for ${counts.missing} Autumn customers, unread ${counts.unread}, of ${granted.size} paid in Autumn.`,
	);
	if (counts.unread > 0) process.exitCode = 1;
}

await main();
