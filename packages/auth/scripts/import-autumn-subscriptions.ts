import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { desc, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import { autumnClient } from "../src/autumn";
import { env } from "../src/env";
import { paidPlanIdFromFlags } from "../src/lib/billing/autumn/entitlements";
import {
	ENTERPRISE_ACCESS_FEATURE_ID,
	PRO_ACCESS_FEATURE_ID,
	SEATS_FEATURE_ID,
} from "../src/lib/billing/autumn/features";
import { seatItem } from "../src/lib/billing/autumn/subscription-row";
import {
	PRO_ANNUAL_PLAN_ID,
	PRO_MONTHLY_PLAN_ID,
} from "../src/lib/billing/legacy/plan-ids";
import { stripeClient } from "../src/stripe";

const PLAN_BY_PRICE: Record<string, string> = {
	[env.STRIPE_PRO_MONTHLY_PRICE_ID]: PRO_MONTHLY_PLAN_ID,
	[env.STRIPE_PRO_YEARLY_PRICE_ID]: PRO_ANNUAL_PLAN_ID,
};

const ENTERPRISE_TEMPLATE_PLAN_ID = "enterprise";
const SEAT_INTERVALS = new Set(["month", "year"]);

const apply = process.argv.includes("--apply");

type AutumnPlan = Awaited<ReturnType<typeof autumnClient.plans.get>>;

function dealPlanId(price: Stripe.Price): string {
	return `enterprise_${price.id.replace(/^price_/, "").toLowerCase()}`;
}

function copiedItem(item: AutumnPlan["items"][number]) {
	return {
		featureId: item.featureId,
		included: item.included,
		unlimited: item.unlimited,
		...(item.reset
			? {
					reset: {
						interval: item.reset.interval,
						intervalCount: item.reset.intervalCount,
					},
				}
			: {}),
		...(item.price
			? {
					price: {
						amount: item.price.amount,
						interval: item.price.interval,
						intervalCount: item.price.intervalCount,
						billingUnits: item.price.billingUnits,
						billingMethod: item.price.billingMethod,
					},
				}
			: {}),
	};
}

/**
 * One Autumn plan per Enterprise Stripe price, so each custom deal keeps its
 * own amount and interval. Usage items and billing controls come from the
 * `enterprise` plan. Link each plan's seat price to its Stripe price on
 * Autumn's Stripe mapping page after the import; the API cannot set it.
 */
async function ensureDealPlan(
	price: Stripe.Price,
	created: Map<string, string>,
): Promise<string> {
	const planId = dealPlanId(price);
	if (created.has(planId)) return planId;
	const existing = await autumnClient.plans.get({ planId }).catch(() => null);
	if (existing) {
		created.set(planId, existing.name);
		return planId;
	}
	const interval = price.recurring?.interval;
	if (
		!interval ||
		!SEAT_INTERVALS.has(interval) ||
		price.unit_amount === null
	) {
		throw new Error(
			`price ${price.id} is not a per-seat monthly or yearly price`,
		);
	}
	const product =
		typeof price.product === "string"
			? await stripeClient.products.retrieve(price.product)
			: price.product;
	const name = "name" in product ? product.name : "Enterprise";
	const template = await autumnClient.plans.get({
		planId: ENTERPRISE_TEMPLATE_PLAN_ID,
	});
	const plan = {
		planId,
		name,
		group: template.group ?? undefined,
		items: [
			{ featureId: PRO_ACCESS_FEATURE_ID },
			{ featureId: ENTERPRISE_ACCESS_FEATURE_ID },
			{
				featureId: SEATS_FEATURE_ID,
				price: {
					amount: price.unit_amount / 100,
					interval: interval as "month" | "year",
					intervalCount: price.recurring?.interval_count ?? 1,
					billingMethod: "prepaid" as const,
				},
			},
			...template.items
				.filter(
					(item) =>
						![
							PRO_ACCESS_FEATURE_ID,
							ENTERPRISE_ACCESS_FEATURE_ID,
							SEATS_FEATURE_ID,
						].includes(item.featureId),
				)
				.map(copiedItem),
		],
		...((template as { billingControls?: object }).billingControls
			? {
					billingControls: (template as { billingControls?: object })
						.billingControls,
				}
			: {}),
	};
	console.log(
		`[autumn-import] ${apply ? "create" : "would create"} plan ${planId} "${name}": ${price.unit_amount / 100} ${price.currency} per seat per ${interval} (Stripe ${price.id})`,
	);
	if (apply) await autumnClient.plans.create(plan as never);
	created.set(planId, name);
	return planId;
}

async function main() {
	const autumn = autumnClient;
	const rows = await db
		.select({
			organizationId: subscriptions.referenceId,
			stripeSubscriptionId: subscriptions.stripeSubscriptionId,
			plan: subscriptions.plan,
			name: authSchema.organizations.name,
			stripeCustomerId: authSchema.organizations.stripeCustomerId,
		})
		.from(subscriptions)
		.innerJoin(
			authSchema.organizations,
			eq(authSchema.organizations.id, subscriptions.referenceId),
		)
		.where(inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]))
		.orderBy(desc(subscriptions.createdAt));

	const seen = new Set<string>();
	const dealPlans = new Map<string, string>();
	const counts = { imported: 0, alreadyLinked: 0, skipped: 0, drifted: 0 };
	const verify = async (organizationId: string) => {
		const result = await autumn.billing.verify({ customerId: organizationId });
		const mismatched = result.subscriptions.filter(
			(subscription) => subscription.mismatches.length > 0,
		);
		if (result.customerMismatches.length > 0 || mismatched.length > 0) {
			counts.drifted += 1;
			console.log(
				`[autumn-import] drift ${organizationId}: ${JSON.stringify({
					customer: result.customerMismatches,
					subscriptions: mismatched,
				})}`,
			);
		}
	};
	for (const row of rows) {
		if (seen.has(row.organizationId)) continue;
		seen.add(row.organizationId);
		const label = `${row.organizationId} (${row.stripeSubscriptionId})`;
		try {
			if (!row.stripeSubscriptionId || !row.stripeCustomerId) {
				counts.skipped += 1;
				console.log(`[autumn-import] skip ${label}: no Stripe ids`);
				continue;
			}
			const existing = await autumn.customers
				.get({ customerId: row.organizationId, expand: ["flags.feature"] })
				.catch(() => null);
			if (existing && paidPlanIdFromFlags(existing.flags)) {
				counts.alreadyLinked += 1;
				await verify(row.organizationId);
				continue;
			}
			const stripeSubscription = await stripeClient.subscriptions.retrieve(
				row.stripeSubscriptionId,
			);
			const seat = seatItem(stripeSubscription);
			const planId = !seat
				? undefined
				: row.plan === "enterprise"
					? await ensureDealPlan(seat.price, dealPlans)
					: PLAN_BY_PRICE[seat.price.id];
			console.log(
				`[autumn-import] ${label}: status=${stripeSubscription.status} items=${stripeSubscription.items.data.length} discounts=${stripeSubscription.discounts.length} trial_end=${stripeSubscription.trial_end ?? "-"}`,
			);
			if (!seat || !planId) {
				counts.skipped += 1;
				console.log(
					`[autumn-import] skip ${label}: unknown price ${seat?.price.id}`,
				);
				continue;
			}
			if (!apply && !(await autumn.plans.get({ planId }).catch(() => null))) {
				counts.imported += 1;
				console.log(
					`[autumn-import] would import ${label} onto new plan ${planId}`,
				);
				continue;
			}
			const result = await autumn.billing.import({
				customerId: row.organizationId,
				customerData: { name: row.name },
				processors: [{ type: "stripe", id: row.stripeCustomerId }],
				billables: [
					{
						processor: "stripe",
						link: { subscriptionId: row.stripeSubscriptionId },
						plan: {
							planId,
							featureQuantities: [
								{ featureId: SEATS_FEATURE_ID, quantity: seat.quantity ?? 1 },
							],
						},
					},
				],
				dryRun: !apply,
			});
			const problems = result.flashed.filter(
				(entry) => entry.mismatch || entry.skipped,
			);
			if (problems.length > 0) {
				counts.skipped += 1;
				console.log(
					`[autumn-import] skip ${label}: ${JSON.stringify(problems)}`,
				);
				continue;
			}
			counts.imported += 1;
			if (apply) await verify(row.organizationId);
		} catch (error) {
			counts.skipped += 1;
			console.error(`[autumn-import] failed ${label}`, error);
		}
	}

	if (dealPlans.size > 0) {
		console.log(
			`[autumn-import] Enterprise plans: ${[...dealPlans].map(([id, name]) => `${id} ("${name}")`).join(", ")}. Link each one's seat price to its Stripe price under Settings, Stripe, Seats.`,
		);
	}
	console.log(
		`[autumn-import] ${apply ? "imported" : "would import"} ${counts.imported}, already linked ${counts.alreadyLinked}, skipped ${counts.skipped}, drifted ${counts.drifted}, of ${seen.size} organizations. Flip BILLING_PROVIDER only when skipped and drifted are both 0.`,
	);
}

await main();
