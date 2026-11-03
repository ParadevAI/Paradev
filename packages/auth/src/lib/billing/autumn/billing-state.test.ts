import { describe, expect, test } from "bun:test";
import { billingFromCustomer } from "./billing-state";

const NOW = Date.UTC(2026, 9, 13);
const DAY = 24 * 60 * 60 * 1000;

type Customer = Parameters<typeof billingFromCustomer>[0];

function customer(overrides: {
	flags?: Customer["flags"];
	subscription?: Partial<Customer["subscriptions"][number]>;
	invoices?: Customer["invoices"];
}): Customer {
	return {
		flags: overrides.flags ?? {},
		subscriptions: overrides.subscription
			? [
					{
						id: "sub_a",
						planId: "pro",
						autoEnable: false,
						addOn: false,
						status: "active",
						pastDue: false,
						canceledAt: null,
						expiresAt: null,
						trialEndsAt: null,
						startedAt: NOW - 40 * DAY,
						currentPeriodStart: NOW - 10 * DAY,
						currentPeriodEnd: NOW + 20 * DAY,
						quantity: 1,
						plan: seatPricedPlan("month"),
						...overrides.subscription,
					} as Customer["subscriptions"][number],
				]
			: [],
		invoices: overrides.invoices ?? [],
		balances: {},
	} as Customer;
}

function seatPricedPlan(interval: "month" | "year") {
	return {
		price: null,
		items: [
			{ featureId: "box_gb_minutes", price: { interval: "month" } },
			{ featureId: "seats", price: { interval } },
			{ featureId: "pro_access", price: null },
		],
	};
}

const pro = { pro_access: { planId: "pro" } } as unknown as Customer["flags"];

function invoice(status: string, total = 40) {
	return {
		planIds: ["pro"],
		stripeId: "in_1",
		processorType: "stripe",
		status,
		total,
		currency: "usd",
		createdAt: NOW - DAY,
		hostedInvoiceUrl: "https://invoice.stripe.com/i/1",
	} as unknown as NonNullable<Customer["invoices"]>[number];
}

describe("activePlan read from Autumn keeps the shape released clients read", () => {
	test("an active monthly Pro org", () => {
		expect(
			billingFromCustomer(customer({ flags: pro, subscription: {} }), NOW),
		).toEqual({
			tier: "pro",
			autumnPlanId: "pro",
			status: "active",
			cancelAt: null,
			scheduledPlanId: null,
			scheduledAt: null,
			periodStart: new Date(NOW - 10 * DAY).toISOString(),
			periodEnd: new Date(NOW + 20 * DAY).toISOString(),
			billingInterval: "month",
			lapsed: false,
			paymentState: { kind: "ok" },
			cloudUsage: null,
			planTier: "pro",
			gatedMachineSizes: [],
			environmentLimit: null,
		});
	});

	test("an annual Pro org reads its interval from the seat price", () => {
		const billing = billingFromCustomer(
			customer({
				flags: pro,
				subscription: { plan: seatPricedPlan("year") } as never,
			}),
			NOW,
		);
		expect(billing.billingInterval).toBe("year");
	});

	test("a seat change scheduled for renewal is not a cancellation", () => {
		const source = customer({
			flags: pro,
			subscription: { expiresAt: NOW + 20 * DAY },
		});
		const active = source.subscriptions[0];
		if (!active) throw new Error("Missing fixture subscription");
		source.subscriptions.unshift({
			...active,
			status: "scheduled",
			expiresAt: null,
			startedAt: NOW + 20 * DAY,
		} as never);
		const billing = billingFromCustomer(source, NOW);
		expect(billing.cancelAt).toBeNull();
		expect(billing.periodEnd).toBe(new Date(NOW + 20 * DAY).toISOString());
		source.subscriptions.shift();
		expect(billingFromCustomer(source, NOW).cancelAt).toBe(
			new Date(NOW + 20 * DAY).toISOString(),
		);
	});

	test("a downgrade scheduled for renewal names the next plan instead of a cancellation", () => {
		const source = customer({
			flags: pro,
			subscription: { planId: "pro", expiresAt: NOW + 20 * DAY },
		});
		const active = source.subscriptions[0];
		if (!active) throw new Error("Missing fixture subscription");
		source.subscriptions.push({
			...active,
			planId: "pro_v2",
			status: "scheduled",
			expiresAt: null,
			startedAt: NOW + 20 * DAY,
		} as never);
		const billing = billingFromCustomer(source, NOW);
		expect(billing.cancelAt).toBeNull();
		expect(billing.scheduledPlanId).toBe("pro_v2");
		expect(billing.scheduledAt).toBe(new Date(NOW + 20 * DAY).toISOString());
	});

	test("the plan tier is the plan's family, else the entitlement tier", () => {
		const tierFor = (metadata: Record<string, unknown>) =>
			billingFromCustomer(
				customer({
					flags: pro,
					subscription: {
						plan: { ...seatPricedPlan("month"), metadata } as never,
					},
				}),
				NOW,
			).planTier;
		expect(tierFor({ family: "team" })).toBe("team");
		expect(tierFor({})).toBe("pro");
		expect(billingFromCustomer(customer({}), NOW).planTier).toBe("free");
	});

	test("a yearly seat license reads as yearly and renews on its anniversary", () => {
		const billing = billingFromCustomer(
			customer({
				flags: pro,
				subscription: {
					plan: { price: null, items: [] } as never,
					startedAt: NOW - 40 * DAY,
				},
			}),
			NOW,
			"year",
		);
		expect(billing.billingInterval).toBe("year");
		expect(billing.periodEnd).toBe(
			new Date(NOW - 40 * DAY + 365 * DAY).toISOString(),
		);
	});

	test("a paid tier with no matching subscription still reads as active for released desktops", () => {
		expect(billingFromCustomer(customer({ flags: pro }), NOW).status).toBe(
			"active",
		);
	});

	test("a pending cancel shows its end date as cancelAt", () => {
		const billing = billingFromCustomer(
			customer({ flags: pro, subscription: { expiresAt: NOW + 20 * DAY } }),
			NOW,
		);
		expect(billing.cancelAt).toBe(new Date(NOW + 20 * DAY).toISOString());
	});

	test("a trial reads as trialing, a failing payment as past_due with its invoice", () => {
		expect(
			billingFromCustomer(
				customer({ flags: pro, subscription: { trialEndsAt: NOW + DAY } }),
				NOW,
			).status,
		).toBe("trialing");
		expect(
			billingFromCustomer(
				customer({
					flags: pro,
					subscription: { pastDue: true },
					invoices: [invoice("open")],
				}),
				NOW,
			),
		).toMatchObject({
			status: "past_due",
			paymentState: {
				kind: "past_due",
				amountDue: 40,
				currency: "usd",
				hostedInvoiceUrl: "https://invoice.stripe.com/i/1",
			},
		});
	});

	test("a free org with an unpaid invoice lapsed; one that never paid did not", () => {
		expect(
			billingFromCustomer(
				customer({ invoices: [invoice("uncollectible")] }),
				NOW,
			),
		).toMatchObject({
			tier: "free",
			status: null,
			lapsed: true,
			paymentState: { kind: "ended_unpaid" },
		});
		expect(
			billingFromCustomer(customer({ invoices: [invoice("paid")] }), NOW),
		).toMatchObject({ lapsed: false, paymentState: { kind: "ok" } });
	});
});

describe("environment limit", () => {
	test("a free organization without an environments grant gets none", () => {
		expect(billingFromCustomer(customer({}), NOW).environmentLimit).toBe(0);
	});

	test("a paid plan without the feature leaves the limit to the default", () => {
		expect(
			billingFromCustomer(customer({ flags: pro, subscription: {} }), NOW)
				.environmentLimit,
		).toBeNull();
	});
});
