import { describe, expect, test } from "bun:test";
import { CardUnavailable } from "../types";
import {
	formEncode,
	idempotencyKey,
	isTestKey,
	LIVE_WRITES_OFF,
	stripeApi,
	stripeFailure,
	writesOff,
} from "./stripeClient";

const ACCOUNT = { id: "acct_1", name: "Acme" };

function recording() {
	const requests: {
		method: string;
		url: string;
		body: string | undefined;
		headers: Record<string, string>;
	}[] = [];
	const send = (async (url: string, init: RequestInit) => {
		requests.push({
			method: String(init.method),
			url,
			body: init.body as string | undefined,
			headers: init.headers as Record<string, string>,
		});
		return new Response(JSON.stringify({ ok: true }), { status: 200 });
	}) as unknown as typeof fetch;
	return { requests, send };
}

describe("the live-key guard", () => {
	test("a test key writes anywhere; a live key writes only in production", () => {
		expect(isTestKey("sk_test_abc")).toBe(true);
		expect(isTestKey("rk_test_abc")).toBe(true);
		expect(isTestKey("sk_live_abc")).toBe(false);
		expect(isTestKey("rk_live_abc")).toBe(false);
		expect(writesOff("sk_test_abc", "development")).toBeNull();
		expect(writesOff("sk_live_abc", "production")).toBeNull();
		expect(writesOff("sk_live_abc", "development")).toBe(LIVE_WRITES_OFF);
		expect(writesOff("rk_live_abc", "test")).toBe(LIVE_WRITES_OFF);
		expect(writesOff("sk_live_abc", undefined)).toBe(LIVE_WRITES_OFF);
		expect(writesOff("sk_live_abc", "preview")).toBe(LIVE_WRITES_OFF);
	});

	test("a request Stripe never answers is a card error, not a crash, and says the state is unknown", async () => {
		const send = (async () => {
			throw new DOMException("timed out", "TimeoutError");
		}) as unknown as typeof fetch;
		const api = stripeApi("sk_test_abc", ACCOUNT, undefined, send);
		await expect(api.post("refunds", { charge: "ch_1" })).rejects.toThrow(
			"Stripe did not answer. Read the card again before you try again",
		);
	});

	test("with a live key outside production no POST or DELETE reaches Stripe", async () => {
		const { requests, send } = recording();
		const api = stripeApi("sk_live_abc", ACCOUNT, "development", send);
		await expect(api.post("refunds", { charge: "ch_1" })).rejects.toThrow(
			LIVE_WRITES_OFF,
		);
		await expect(api.del("subscriptions/sub_1")).rejects.toThrow(
			LIVE_WRITES_OFF,
		);
		expect(requests).toEqual([]);
		expect(api.writesOff).toBe(LIVE_WRITES_OFF);
		expect(api.live).toBe(true);
	});

	test("reads still work with a live key, and so does the preview that stores nothing", async () => {
		const { requests, send } = recording();
		const api = stripeApi("sk_live_abc", ACCOUNT, "development", send);
		await api.get("charges/ch_1");
		await api.post("invoices/create_preview", { customer: "cus_1" });
		expect(
			requests.map((request) => `${request.method} ${request.url}`),
		).toEqual([
			"GET https://api.stripe.com/v1/charges/ch_1",
			"POST https://api.stripe.com/v1/invoices/create_preview",
		]);
	});

	test("a test key writes, with the retry key and a pinned API version", async () => {
		const { requests, send } = recording();
		const api = stripeApi("sk_test_abc", ACCOUNT, "development", send);
		await api.post(
			"refunds",
			{ charge: "ch_1", amount: 500, metadata: { card: "c1" } },
			"key-1",
		);
		expect(requests[0]?.body).toBe(
			"charge=ch_1&amount=500&metadata%5Bcard%5D=c1",
		);
		expect(requests[0]?.headers["Idempotency-Key"]).toBe("key-1");
		expect(requests[0]?.headers["Stripe-Version"]).toBe("2025-12-15.clover");
		expect(api.url("customers/cus_1")).toBe(
			"https://dashboard.stripe.com/acct_1/test/customers/cus_1",
		);
	});
});

describe("formEncode", () => {
	test("nests objects and lists the way Stripe reads them", () => {
		expect(
			decodeURIComponent(
				formEncode({
					expand: ["a.b", "c"],
					pause_collection: { behavior: "void" },
					discounts: [{ coupon: "X" }],
					note: "",
					skip: undefined,
				}),
			),
		).toBe(
			"expand[0]=a.b&expand[1]=c&pause_collection[behavior]=void&discounts[0][coupon]=X&note=",
		);
	});
});

describe("stripeFailure", () => {
	test("maps Stripe's refusals to the card state that explains them", () => {
		expect(
			stripeFailure(404, { error: { code: "resource_missing" } }).state,
		).toBe("gone");
		expect(stripeFailure(401, {}).state).toBe("no_connector");
		expect(stripeFailure(403, {}).state).toBe("no_access");
		expect(stripeFailure(429, {}).text).toBe(
			"Stripe is limiting requests. Try again in a minute",
		);
		const declined = stripeFailure(402, {
			error: { type: "card_error", message: "Your card was declined." },
		});
		expect(declined).toBeInstanceOf(CardUnavailable);
		expect(declined.text).toBe("Your card was declined.");
	});
});

describe("idempotencyKey", () => {
	test("is the same for the same card and input, and different for another amount", () => {
		const ctx = { readerId: "r", organizationId: "o" };
		expect(idempotencyKey(ctx, ["refund", "ch_1", 500])).toBe(
			idempotencyKey(ctx, ["refund", "ch_1", 500]),
		);
		expect(idempotencyKey(ctx, ["refund", "ch_1", 500])).not.toBe(
			idempotencyKey(ctx, ["refund", "ch_1", 501]),
		);
	});
});
