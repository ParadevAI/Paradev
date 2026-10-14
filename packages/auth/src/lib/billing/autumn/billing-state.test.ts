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
			status: "active",
			cancelAt: null,
			periodStart: new Date(NOW - 10 * DAY).toISOString(),
			periodEnd: new Date(NOW + 20 * DAY).toISOString(),
			billingInterval: "month",
			lapsed: false,
			paymentState: { kind: "ok" },
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
