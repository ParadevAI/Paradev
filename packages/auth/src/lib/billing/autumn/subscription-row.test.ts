import { describe, expect, test } from "bun:test";
import { PLAN_TIERS } from "@superset/shared/billing";
import type Stripe from "stripe";
import { planFromStripePrice } from "../legacy/plan-ids";
import { paidPlanIdFromFlags, tierFromFlags } from "./entitlements";
import {
	subscriptionRowFromStripe,
	subscriptionTransitions,
} from "./subscription-row";

function stripeSubscription(
	overrides: Partial<Stripe.Subscription> = {},
	interval: "month" | "year" = "month",
): Stripe.Subscription {
	return {
		id: "sub_1",
		customer: "cus_1",
		status: "active",
		cancel_at_period_end: false,
		cancel_at: null,
		canceled_at: null,
		ended_at: null,
		trial_start: null,
		trial_end: null,
		schedule: null,
		created: 1_700_000_000,
		cancellation_details: null,
		metadata: {},
		items: {
			data: [
				{
					id: "si_box",
					quantity: undefined,
					current_period_start: 1_700_000_000,
					current_period_end: 1_702_592_000,
					price: { recurring: { interval: "month", usage_type: "metered" } },
				},
				{
					id: "si_seats",
					quantity: 4,
					current_period_start: 1_700_000_000,
					current_period_end: 1_702_592_000,
					price: { recurring: { interval, usage_type: "licensed" } },
				},
			],
		},
		...overrides,
	} as unknown as Stripe.Subscription;
}

describe("a subscription row reads the same as the Stripe plugin wrote it", () => {
	test("status, periods, seats, interval and ids", () => {
		expect(subscriptionRowFromStripe(stripeSubscription())).toEqual({
			status: "active",
			stripeCustomerId: "cus_1",
			stripeSubscriptionId: "sub_1",
			periodStart: new Date(1_700_000_000_000),
			periodEnd: new Date(1_702_592_000_000),
			cancelAtPeriodEnd: false,
			cancelAt: null,
			canceledAt: null,
			endedAt: null,
			seats: 4,
			billingInterval: "month",
			stripeScheduleId: null,
		});
	});

	test("an annual subscription keeps Stripe's own interval, `year`", () => {
		expect(
			subscriptionRowFromStripe(stripeSubscription({}, "year")).billingInterval,
		).toBe("year");
	});

	test("a pending cancel, a schedule and a trial carry over", () => {
		const row = subscriptionRowFromStripe(
			stripeSubscription({
				cancel_at_period_end: true,
				cancel_at: 1_702_592_000,
				canceled_at: 1_701_000_000,
				schedule: "sub_sched_1",
				trial_start: 1_699_000_000,
				trial_end: 1_700_000_000,
			}),
		);
		expect(row).toMatchObject({
			cancelAtPeriodEnd: true,
			cancelAt: new Date(1_702_592_000_000),
			canceledAt: new Date(1_701_000_000_000),
			stripeScheduleId: "sub_sched_1",
			trialStart: new Date(1_699_000_000_000),
			trialEnd: new Date(1_700_000_000_000),
		});
	});
});

describe("notices fire when the Stripe plugin fired them", () => {
	const live = { status: "active", cancelAtPeriodEnd: false, cancelAt: null };

	test("a first subscription, or one leaving incomplete, has started", () => {
		expect(
			subscriptionTransitions(undefined, stripeSubscription(), false).started,
		).toBe(true);
		expect(
			subscriptionTransitions(
				{ ...live, status: "incomplete" },
				stripeSubscription(),
				false,
			).started,
		).toBe(true);
	});

	test("a subscription already live at cutover does not start again", () => {
		expect(subscriptionTransitions(live, stripeSubscription(), false)).toEqual({
			started: false,
			canceled: false,
		});
	});

	test("a recovered payment does not send a second welcome", () => {
		expect(
			subscriptionTransitions(
				{ ...live, status: "past_due" },
				stripeSubscription(),
				false,
			).started,
		).toBe(false);
	});

	test("a new subscription replacing a paying one (monthly to annual) is not a new conversion", () => {
		expect(
			subscriptionTransitions(undefined, stripeSubscription(), true).started,
		).toBe(false);
	});

	test("a cancel fires once, when it first appears on an active subscription", () => {
		const canceling = stripeSubscription({ cancel_at_period_end: true });
		expect(subscriptionTransitions(live, canceling, false).canceled).toBe(true);
		expect(
			subscriptionTransitions(
				{ ...live, cancelAtPeriodEnd: true },
				canceling,
				false,
			).canceled,
		).toBe(false);
	});
});

describe("plan tiers come from Autumn's access features", () => {
	const flag = (planId: string) => ({ planId });

	test("enterprise_access wins over pro_access, and neither is free", () => {
		expect(
			tierFromFlags({
				pro_access: flag("pro"),
				enterprise_access: flag("enterprise_acme"),
			}),
		).toBe("enterprise");
		expect(tierFromFlags({ pro_access: flag("teams") })).toBe("pro");
		expect(tierFromFlags({ box_gb_minutes: flag("hobby") })).toBe("free");
		expect(tierFromFlags(undefined)).toBe("free");
	});

	test("every tier is one released clients know", () => {
		for (const flags of [
			{},
			{ pro_access: flag("pro") },
			{ enterprise_access: flag("enterprise") },
		]) {
			expect(PLAN_TIERS).toContain(tierFromFlags(flags));
		}
	});

	test("the paid plan id is the plan granting access", () => {
		expect(paidPlanIdFromFlags({ pro_access: flag("pro_annual") })).toBe(
			"pro_annual",
		);
		expect(paidPlanIdFromFlags({ box_gb_minutes: flag("hobby") })).toBeNull();
	});

	test("a subscription Autumn has not imported reads its tier from its Stripe price", () => {
		const prices = { pro: ["price_m", "price_y"], enterprise: ["price_e"] };
		expect(planFromStripePrice("price_e", prices)).toBe("enterprise");
		expect(planFromStripePrice("price_y", prices)).toBe("pro");
		expect(planFromStripePrice("price_autumn", prices)).toBeNull();
		expect(planFromStripePrice(undefined, prices)).toBeNull();
	});
});
