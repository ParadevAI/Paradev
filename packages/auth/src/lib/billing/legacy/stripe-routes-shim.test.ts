import { beforeEach, describe, expect, test } from "bun:test";
import { stripe } from "@better-auth/stripe";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import type Stripe from "stripe";
import { type StripeFallbackClient, stripeFallback } from "./stripe-fallback";
import {
	type AutumnBillingDeps,
	BILLING_ERROR_CODES,
	cancelWithAutumn,
	ENTERPRISE_CHECKOUT_MESSAGE,
	type LiveSubscription,
	restoreWithAutumn,
	type UpgradeBody,
	upgradeWithAutumn,
	withAutumnBilling,
} from "./stripe-routes-shim";

const ORG = "00000000-0000-0000-0000-0000000000aa";
const WEB = "https://app.superset.sh";
const API = "https://api.superset.sh/api/auth";

function stripePlugin() {
	return stripe({
		stripeClient: {} as Stripe,
		stripeWebhookSecret: "whsec_test",
		subscription: {
			enabled: true,
			plans: [
				{
					name: "pro",
					priceId: "price_pro",
					annualDiscountPriceId: "price_pro_y",
				},
				{ name: "enterprise", priceId: "price_ent" },
			],
		},
	});
}

let calls: { method: string; params: unknown }[];
let live: LiveSubscription | null;
let paymentUrl: string | null;
let managed: boolean;

function fakeDeps(): AutumnBillingDeps {
	return {
		attach: async (params) => {
			calls.push({ method: "attach", params });
			return { paymentUrl };
		},
		update: async (params) => {
			calls.push({ method: "update", params });
			return {};
		},
		managedByAutumn: async () => managed,
		cancelPortalUrl: async (subscription, returnUrl) => {
			calls.push({
				method: "cancelPortal",
				params: { subscription, returnUrl },
			});
			return "https://billing.stripe.com/p/session/cancel";
		},
		switchIntervalPortalUrl: async (subscription, annual, returnUrl) => {
			calls.push({
				method: "switchPortal",
				params: { subscription, annual, returnUrl },
			});
			return "https://billing.stripe.com/p/session/switch";
		},
		restoreInStripe: async (subscription) => {
			calls.push({ method: "restoreInStripe", params: subscription });
		},
		ensureCustomer: async (id) => {
			calls.push({ method: "ensureCustomer", params: id });
		},
		currentPlanId: async () => (live ? "pro" : null),
		findLiveSubscription: async () => live,
		countBillableSeats: async () => 3,
		sync: async (id) => {
			calls.push({ method: "sync", params: id });
		},
		handleStripeWebhook: async () => {
			calls.push({ method: "stripeWebhook", params: null });
		},
		completeCheckout: async (id) => {
			calls.push({ method: "completeCheckout", params: id });
		},
	};
}

function liveSubscription(
	overrides: Partial<LiveSubscription> = {},
): LiveSubscription {
	return {
		plan: "pro",
		status: "active",
		billingInterval: "month",
		cancelAtPeriodEnd: false,
		cancelAt: null,
		stripeSubscriptionId: "sub_1",
		stripeCustomerId: "cus_1",
		stripeScheduleId: null,
		...overrides,
	};
}

beforeEach(() => {
	calls = [];
	live = null;
	paymentUrl = "https://checkout.stripe.com/c/pay/cs_test";
	managed = true;
});

describe("released clients keep the same routes", () => {
	const original = stripePlugin();
	const wrapped = withAutumnBilling(original, {
		enabled: true,
		deps: fakeDeps,
	});

	for (const key of [
		"upgradeSubscription",
		"cancelSubscription",
		"restoreSubscription",
		"subscriptionSuccess",
		"stripeWebhook",
	] as const) {
		test(`${key} keeps its path, method, body schema and every middleware`, () => {
			const before = original.endpoints[key];
			const after = wrapped.endpoints[key];
			expect(after).not.toBe(before);
			expect(after.path).toBe(before.path);
			expect(after.options.method).toEqual(before.options.method);
			expect(String(after.options.body)).toBe(String(before.options.body));
			expect(after.options.use?.length).toBe(before.options.use?.length);
		});
	}

	test("the success route still refuses a callbackURL from another origin", async () => {
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			secret: "test-secret-test-secret-test-secret",
			database: memoryAdapter({}),
			plugins: [wrapped],
			advanced: { disableOriginCheck: false },
		});
		const foreign = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/subscription/success?callbackURL=https://evil.example.com/&checkoutSessionId=cs_1",
			),
		);
		expect(foreign.status).toBe(403);
		const trusted = await auth.handler(
			new Request(
				"http://localhost:3000/api/auth/subscription/success?callbackURL=http://localhost:3000/billing&checkoutSessionId=cs_1",
			),
		);
		expect(trusted.status).toBe(302);
		expect(trusted.headers.get("location")).toBe(
			"http://localhost:3000/billing",
		);
		expect(calls).toContainEqual({
			method: "completeCheckout",
			params: "cs_1",
		});
	});
});

describe("upgrade", () => {
	const body: UpgradeBody = {
		plan: "pro",
		successUrl: `${WEB}/settings/billing?success=true`,
		cancelUrl: WEB,
		disableRedirect: true,
	};

	test("monthly checkout keeps Stripe's checkout settings and counts seats on the server", async () => {
		await upgradeWithAutumn(fakeDeps(), {
			userId: "user_1",
			referenceId: ORG,
			baseURL: API,
			body,
		});
		expect(calls.map((call) => call.method)).toEqual([
			"ensureCustomer",
			"attach",
		]);
		expect(calls[1]?.params).toEqual({
			customerId: ORG,
			planId: "pro",
			featureQuantities: [{ featureId: "seats", quantity: 3 }],
			successUrl: `${API}/subscription/success?callbackURL=${encodeURIComponent(body.successUrl)}&checkoutSessionId={CHECKOUT_SESSION_ID}`,
			redirectMode: "always",
			checkoutSessionParams: {
				cancel_url: WEB,
				allow_promotion_codes: true,
				billing_address_collection: "required",
				tax_id_collection: { enabled: true },
				customer_update: { name: "auto", address: "auto" },
				metadata: { organizationId: ORG, initiatedByUserId: "user_1" },
				subscription_data: {
					metadata: { organizationId: ORG, userId: "user_1" },
				},
			},
		});
	});

	test("annual checkout uses the annual plan and no promotion codes", async () => {
		await upgradeWithAutumn(fakeDeps(), {
			userId: "user_1",
			referenceId: ORG,
			baseURL: API,
			body: { ...body, annual: true },
		});
		const params = calls[1]?.params as {
			planId: string;
			checkoutSessionParams: { allow_promotion_codes: boolean };
		};
		expect(params.planId).toBe("pro_annual");
		expect(params.checkoutSessionParams.allow_promotion_codes).toBe(false);
	});

	test("with no checkout page needed, upgrade syncs and sends the client to the success page", async () => {
		paymentUrl = null;
		const result = await upgradeWithAutumn(fakeDeps(), {
			userId: "user_1",
			referenceId: ORG,
			baseURL: API,
			body,
		});
		expect(result.url).toBe(body.successUrl);
		expect(calls.at(-1)).toEqual({ method: "sync", params: ORG });
	});

	test("enterprise is refused with the same message as before", async () => {
		await expect(
			upgradeWithAutumn(fakeDeps(), {
				userId: "user_1",
				referenceId: ORG,
				baseURL: API,
				body: { ...body, plan: "enterprise" },
			}),
		).rejects.toThrow(ENTERPRISE_CHECKOUT_MESSAGE);
		expect(calls).toEqual([]);
	});

	test("an unknown plan answers SUBSCRIPTION_PLAN_NOT_FOUND", async () => {
		await expect(
			upgradeWithAutumn(fakeDeps(), {
				userId: "user_1",
				referenceId: ORG,
				baseURL: API,
				body: { ...body, plan: "team" },
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
			body: {
				code: "SUBSCRIPTION_PLAN_NOT_FOUND",
				message: BILLING_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
			},
		});
	});

	test("the same plan and interval again answers ALREADY_SUBSCRIBED_PLAN, a new interval goes through", async () => {
		live = liveSubscription();
		await expect(
			upgradeWithAutumn(fakeDeps(), {
				userId: "user_1",
				referenceId: ORG,
				baseURL: API,
				body,
			}),
		).rejects.toMatchObject({
			body: { code: "ALREADY_SUBSCRIBED_PLAN" },
		});
		await upgradeWithAutumn(fakeDeps(), {
			userId: "user_1",
			referenceId: ORG,
			baseURL: API,
			body: { ...body, annual: true },
		});
		expect(calls.some((call) => call.method === "attach")).toBe(true);
	});
});

describe("cancel", () => {
	test("asks for Stripe's cancel page for the live subscription", async () => {
		live = liveSubscription();
		expect(
			await cancelWithAutumn(fakeDeps(), {
				referenceId: ORG,
				body: { returnUrl: WEB, disableRedirect: false },
			}),
		).toEqual({
			url: "https://billing.stripe.com/p/session/cancel",
			redirect: true,
		});
	});

	test("no live subscription answers SUBSCRIPTION_NOT_FOUND", async () => {
		await expect(
			cancelWithAutumn(fakeDeps(), {
				referenceId: ORG,
				body: { returnUrl: WEB, disableRedirect: false },
			}),
		).rejects.toMatchObject({ body: { code: "SUBSCRIPTION_NOT_FOUND" } });
	});
});

describe("a subscriber Autumn does not manage yet", () => {
	const body: UpgradeBody = {
		plan: "pro",
		annual: true,
		successUrl: `${WEB}/settings/billing?success=true`,
		cancelUrl: WEB,
		returnUrl: WEB,
		disableRedirect: true,
	};

	test("switching interval updates their Stripe subscription instead of starting a second one", async () => {
		live = liveSubscription();
		managed = false;
		const result = await upgradeWithAutumn(fakeDeps(), {
			userId: "user_1",
			referenceId: ORG,
			body,
			baseURL: API,
		});
		expect(result).toEqual({
			url: "https://billing.stripe.com/p/session/switch",
			redirect: false,
		});
		expect(calls.map((call) => call.method)).toEqual(["switchPortal"]);
	});

	test("restore clears the cancel on their Stripe subscription", async () => {
		live = liveSubscription({ cancelAtPeriodEnd: true });
		managed = false;
		const deps = { ...fakeDeps(), currentPlanId: async () => null };
		await restoreWithAutumn(deps, { referenceId: ORG });
		expect(calls.map((call) => call.method)).toEqual([
			"restoreInStripe",
			"sync",
		]);
	});
});

describe("restore", () => {
	test("undoes a pending cancel through Autumn and syncs", async () => {
		live = liveSubscription({ cancelAtPeriodEnd: true });
		const result = await restoreWithAutumn(fakeDeps(), { referenceId: ORG });
		expect(calls).toEqual([
			{
				method: "update",
				params: { customerId: ORG, planId: "pro", cancelAction: "uncancel" },
			},
			{ method: "sync", params: ORG },
		]);
		expect(result).toMatchObject({ id: "sub_1", cancel_at_period_end: false });
	});

	test("nothing pending answers SUBSCRIPTION_NOT_PENDING_CHANGE", async () => {
		live = liveSubscription();
		await expect(
			restoreWithAutumn(fakeDeps(), { referenceId: ORG }),
		).rejects.toMatchObject({
			body: { code: "SUBSCRIPTION_NOT_PENDING_CHANGE" },
		});
	});

	test("a lapsed subscription answers SUBSCRIPTION_NOT_ACTIVE", async () => {
		live = liveSubscription({ status: "past_due", cancelAtPeriodEnd: true });
		await expect(
			restoreWithAutumn(fakeDeps(), { referenceId: ORG }),
		).rejects.toMatchObject({ body: { code: "SUBSCRIPTION_NOT_ACTIVE" } });
	});
});

describe("Stripe fallback", () => {
	const ref = {
		stripeCustomerId: "cus_1",
		stripeSubscriptionId: "sub_1",
		stripeScheduleId: null,
	};
	let stripeCalls: { method: string; params: unknown }[];
	let current: { id: string; cancel_at: number | null };
	let scheduleStatus: string;

	function fakeStripe(): StripeFallbackClient {
		return {
			billingPortal: {
				sessions: {
					create: async (params: unknown) => {
						stripeCalls.push({ method: "portal", params });
						return { url: "https://billing.stripe.com/p/session/x" };
					},
				},
			},
			subscriptions: {
				retrieve: async () => ({
					...current,
					items: {
						data: [
							{
								id: "si_seats",
								quantity: 4,
								price: { recurring: { usage_type: "licensed" } },
							},
						],
					},
				}),
				update: async (id: string, params: unknown) => {
					stripeCalls.push({ method: "update", params: { id, params } });
					return {};
				},
			},
			subscriptionSchedules: {
				retrieve: async (id: string) => ({ id, status: scheduleStatus }),
				release: async (id: string) => {
					stripeCalls.push({ method: "release", params: id });
					return {};
				},
			},
		} as unknown as StripeFallbackClient;
	}

	const fallback = () =>
		stripeFallback(fakeStripe(), { monthly: "price_m", yearly: "price_y" });

	beforeEach(() => {
		stripeCalls = [];
		current = { id: "sub_1", cancel_at: null };
		scheduleStatus = "active";
	});

	test("cancel opens the portal straight on the subscription's cancel flow", async () => {
		await fallback().cancelPortalUrl(ref, WEB);
		expect(stripeCalls).toEqual([
			{
				method: "portal",
				params: {
					customer: "cus_1",
					return_url: WEB,
					flow_data: {
						type: "subscription_cancel",
						subscription_cancel: { subscription: "sub_1" },
					},
				},
			},
		]);
	});

	test("switching to annual confirms the seat item on the yearly price with the same seats", async () => {
		await fallback().switchIntervalPortalUrl(ref, true, WEB);
		expect(stripeCalls[0]?.params).toMatchObject({
			flow_data: {
				type: "subscription_update_confirm",
				subscription_update_confirm: {
					subscription: "sub_1",
					items: [{ id: "si_seats", price: "price_y", quantity: 4 }],
				},
			},
		});
	});

	test("restore clears cancel_at when set, otherwise cancel_at_period_end", async () => {
		current = { id: "sub_1", cancel_at: 1_800_000_000 };
		await fallback().restoreInStripe(ref);
		current = { id: "sub_1", cancel_at: null };
		await fallback().restoreInStripe(ref);
		expect(stripeCalls).toEqual([
			{ method: "update", params: { id: "sub_1", params: { cancel_at: "" } } },
			{
				method: "update",
				params: { id: "sub_1", params: { cancel_at_period_end: false } },
			},
		]);
	});

	test("restore releases a pending schedule instead of touching the subscription", async () => {
		await fallback().restoreInStripe({
			...ref,
			stripeScheduleId: "sub_sched_1",
		});
		scheduleStatus = "released";
		await fallback().restoreInStripe({
			...ref,
			stripeScheduleId: "sub_sched_1",
		});
		expect(stripeCalls).toEqual([{ method: "release", params: "sub_sched_1" }]);
	});
});
