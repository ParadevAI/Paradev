import { beforeEach, describe, expect, mock, test } from "bun:test";
import { asShown } from "../testing";
import type { CardContext, ResolvedCard } from "../types";

type Row = Record<string, unknown>;
let calls: { method: string; path: string; body?: Row; key?: string }[] = [];
let store: Record<string, Row> = {};
let lists: Record<string, Row[]> = {};
let fail: { path: RegExp; error: Error } | null = null;
let writesOff: string | null = null;
let replies: string[] = [];
let mails: { to: string[]; subject: string; text: string }[] = [];
let gmail = true;
let replyFails = false;
let readerEmail = "satya@superset.sh";
let live = false;

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86_400;

const { CardUnavailable } = await import("../types");

const api = {
	get live() {
		return live;
	},
	account: { id: "acct_1", name: "Sandbox" },
	get writesOff() {
		return writesOff;
	},
	get: async (path: string, query?: Row) => {
		const [name] = path.split("?");
		if (name && lists[name]) {
			const customer = query?.customer;
			const charge = query?.charge;
			return {
				data: lists[name].filter(
					(row) =>
						(!customer || row.customer === customer) &&
						(!charge || row.charge === charge),
				),
				has_more: false,
			};
		}
		const found = store[path];
		if (!found) throw new CardUnavailable("gone", "Stripe no longer has that");
		return found;
	},
	post: async (path: string, body?: Row, key?: string) => {
		if (path === "invoices/create_preview") {
			return { total: store.preview?.total ?? 0 };
		}
		if (writesOff) throw new CardUnavailable("error", writesOff);
		if (fail?.path.test(path)) throw fail.error;
		calls.push({
			method: "POST",
			path,
			...(body ? { body } : {}),
			...(key ? { key } : {}),
		});
		if (path === "refunds")
			return { id: "re_new", amount: body?.amount, metadata: body?.metadata };
		if (/invoices\/[^/]+\/pay$/.test(path)) return { status: "paid" };
		return {};
	},
	del: async (path: string, body?: Row) => {
		if (writesOff) throw new CardUnavailable("error", writesOff);
		if (fail?.path.test(path)) throw fail.error;
		calls.push({ method: "DELETE", path, ...(body ? { body } : {}) });
		return {};
	},
	url: (path: string) => `https://dashboard.stripe.com/acct_1/test/${path}`,
};

const actualClient = await import("./stripeClient");
mock.module("./stripeClient", () => ({
	...actualClient,
	stripeFor: async () => api,
}));
mock.module("./calendarAsk", () => ({
	readAsk: async () => ({
		view: {
			source: "gmail",
			from: "Avery Chen",
			subject: "Refund please",
			snippet: "Can I get my money back?",
			url: "https://mail.google.com/x",
			replyTo: ["Avery Chen <satya+avery@superset.sh>"],
			version: "m2",
		},
		canReply: gmail,
		participants: null,
		reply: async () => {},
	}),
	replyToAsk: async (
		_ctx: unknown,
		_refs: unknown,
		seen: string,
		text: string,
	) => {
		if (replyFails || seen !== "m2") throw new Error("thread moved");
		replies.push(text);
	},
}));
mock.module("./calendarMail", () => ({
	NOTE_RECIPIENTS_MAX: 50,
	canMailNote: async () => gmail,
	mailNote: async (_ctx: unknown, note: (typeof mails)[number]) => {
		if (!gmail) return false;
		mails.push(note);
		return true;
	},
}));
mock.module("@superset/db/client", () => ({
	db: { query: { users: { findFirst: async () => ({ email: readerEmail }) } } },
}));

const { stripeRefund } = await import("./stripeRefund");
const { stripeSubscription } = await import("./stripeSubscription");
const { stripeAdjust } = await import("./stripeAdjust");
const stripeFailedPayment = asShown(
	(await import("./stripeFailedPayment")).stripeFailedPayment,
);
const stripeDispute = asShown((await import("./stripeDispute")).stripeDispute);
const stripeInvoice = asShown((await import("./stripeInvoice")).stripeInvoice);

const ctx: CardContext = {
	readerId: "reader",
	organizationId: "org",
	card: {
		id: "card1",
		agentSessionId: "s",
		workspaceId: null,
		hostId: null,
		waiting: false,
		fromSuperset: false,
	},
};
type View<K extends string> = Extract<
	NonNullable<ResolvedCard["view"]>,
	{ kind: K }
>;

const visa = { card: { brand: "visa", last4: "4242" } };
const charge = (id: string, over: Row = {}) => ({
	id,
	amount: 4900,
	amount_refunded: 0,
	currency: "usd",
	status: "succeeded",
	created: NOW - DAY,
	description: "Onboarding session",
	disputed: false,
	customer: "cus_avery1",
	payment_intent: `pi_${id}`,
	payment_method_details: visa,
	...over,
});
const subscription = (id: string, over: Row = {}) => ({
	id,
	status: "active",
	customer: "cus_avery1",
	cancel_at_period_end: false,
	cancel_at: null,
	trial_end: null,
	pause_collection: null,
	discounts: ["di_old"],
	latest_invoice: "in_latest1",
	items: {
		data: [
			{
				quantity: 1,
				current_period_start: NOW - 10 * DAY,
				current_period_end: NOW + 20 * DAY,
				price: {
					unit_amount: 2000,
					currency: "usd",
					product: "prod_1",
					nickname: null,
					recurring: { interval: "month", interval_count: 1 },
				},
			},
		],
	},
	...over,
});
const invoice = (id: string, over: Row = {}) => ({
	id,
	number: "INV-0001",
	status: "open",
	customer: "cus_avery1",
	customer_email: "satya+avery@superset.sh",
	amount_due: 2000,
	amount_paid: 0,
	amount_remaining: 2000,
	total: 2000,
	currency: "usd",
	created: NOW - DAY,
	due_date: null,
	collection_method: "charge_automatically",
	attempt_count: 1,
	next_payment_attempt: null,
	hosted_invoice_url: "https://invoice.stripe.com/i/test_1",
	lines: { data: [{ description: "1 × Pro", amount: 2000 }] },
	payments: {
		data: [
			{
				status: "open",
				payment: {
					payment_intent: {
						id: "pi_sub1",
						latest_charge: "ch_failed01",
						last_payment_error: { message: "Your card was declined." },
					},
				},
			},
		],
	},
	...over,
});

beforeEach(() => {
	calls = [];
	fail = null;
	writesOff = null;
	replies = [];
	mails = [];
	gmail = true;
	replyFails = false;
	readerEmail = "satya@superset.sh";
	live = false;
	store = {
		"customers/cus_avery1": {
			id: "cus_avery1",
			name: "Avery Chen",
			email: "satya+avery@superset.sh",
			created: NOW - 90 * DAY,
			balance: 0,
			currency: "usd",
			delinquent: false,
			invoice_settings: { default_payment_method: visa },
		},
		"charges/ch_oneoff1": charge("ch_oneoff1"),
		"charges/ch_subpay1": charge("ch_subpay1", {
			amount: 2000,
			description: "Subscription",
		}),
		"subscriptions/sub_pro001": subscription("sub_pro001"),
		"invoices/in_latest1": invoice("in_latest1", {
			status: "paid",
			amount_paid: 2000,
			amount_due: 0,
			amount_remaining: 0,
			payments: {
				data: [
					{
						status: "open",
						payment: {
							payment_intent: {
								id: "pi_sub0",
								latest_charge: "ch_failed00",
								last_payment_error: { message: "Insufficient funds." },
							},
						},
					},
					{
						status: "paid",
						payment: {
							payment_intent: { id: "pi_sub1", latest_charge: "ch_subpay1" },
						},
					},
				],
			},
		}),
		"invoices/in_failed1": invoice("in_failed1"),
		"invoices/in_draft01": invoice("in_draft01", {
			status: "draft",
			number: null,
			collection_method: "send_invoice",
			amount_due: 30000,
			total: 30000,
		}),
		preview: { total: -1342 },
		account: { default_currency: "eur" },
	};
	lists = {
		subscriptions: [subscription("sub_pro001")],
		charges: [charge("ch_oneoff1"), charge("ch_subpay1", { amount: 2000 })],
		products: [{ id: "prod_1", name: "Pro" }],
		refunds: [],
		"customers/cus_avery1/balance_transactions": [],
		coupons: [
			{
				id: "QUARTER",
				name: "Sorry",
				percent_off: 25,
				amount_off: null,
				currency: null,
				duration: "repeating",
				duration_in_months: 3,
				valid: true,
			},
			{
				id: "EXPIRED",
				name: "Old",
				percent_off: 50,
				amount_off: null,
				currency: null,
				duration: "once",
				duration_in_months: null,
				valid: false,
			},
		],
	};
});

describe("the shared customer header", () => {
	test("says who the customer is, what they hold and what they have paid", async () => {
		const card = await stripeRefund.resolve({ charge: "ch_oneoff1" }, ctx);
		const { customer, account } = card.view as View<"stripe.refund">;
		expect(account).toEqual({ name: "Sandbox", live: false, writesOff: null });
		expect(customer?.name).toBe("Avery Chen");
		expect(customer?.card).toEqual({ brand: "visa", last4: "4242" });
		expect(customer?.spent).toEqual({ amount: 6900, currency: "usd" });
		expect(
			customer?.subscriptions.map(
				(item) => `${item.product} ${item.price.amount}/${item.price.interval}`,
			),
		).toEqual(["Pro 2000/month"]);
		expect(customer?.charges.map((item) => item.amount)).toEqual([4900, 2000]);
	});
});

describe("stripe.refund", () => {
	const refs = {
		charge: "ch_oneoff1",
		amount: 2500,
		reason: "requested_by_customer" as const,
		cancel_subscription: "sub_pro001",
		gmail_thread: "18c1a2b3c4d5e6f7",
		reply: "Refunded, sorry about that.",
	};

	test("proposes the agent's amount, capped at what is left", async () => {
		store["charges/ch_oneoff1"] = charge("ch_oneoff1", {
			amount_refunded: 3000,
		});
		const view = (await stripeRefund.resolve(refs, ctx))
			.view as View<"stripe.refund">;
		expect(view.refundable).toBe(1900);
		expect(view.proposed).toEqual({
			amount: 1900,
			reason: "requested_by_customer",
			cancel: "sub_pro001",
		});
		expect(view.email?.draft).toBe("Refunded, sorry about that.");
	});

	test("refunds the chosen amount once, tagged with the card, and says exactly what it did", async () => {
		const { result } = await stripeRefund.act(refs, "refund", ctx, {
			amount: 2500,
			reason: "requested_by_customer",
		});
		expect(calls).toHaveLength(1);
		expect(calls[0]?.path).toBe("refunds");
		expect(calls[0]?.body).toEqual({
			charge: "ch_oneoff1",
			amount: 2500,
			reason: "requested_by_customer",
			metadata: { superset_card: "card1" },
		});
		expect(calls[0]?.key).toBeTruthy();
		expect(result.notice?.text).toBe(
			"Refunded $25.00 to Avery Chen (Visa •••• 4242)",
		);
	});

	test("never refunds more than is left, and never cancels a subscription the customer does not have", async () => {
		await expect(
			stripeRefund.act(refs, "refund", ctx, { amount: 4901 }),
		).rejects.toThrow("Amount cannot be more than $49.00.");
		await expect(
			stripeRefund.act(refs, "refund", ctx, {
				amount: 100,
				cancel: "sub_other9",
			}),
		).rejects.toThrow("not one this customer has");
		expect(calls).toEqual([]);
	});

	test("cancels the subscription and replies only when the reader chose them", async () => {
		const { result } = await stripeRefund.act(refs, "refund", ctx, {
			amount: 4900,
			cancel: "sub_pro001",
			reply: { text: "Refunded.", version: "m2" },
		});
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			"POST refunds",
			"DELETE subscriptions/sub_pro001",
		]);
		expect(replies).toEqual(["Refunded."]);
		expect(result.notice).toEqual({
			tone: "good",
			text: "Refunded $49.00 to Avery Chen (Visa •••• 4242) and canceled the subscription",
		});
	});

	test("the reason 'Other' sends Stripe no reason, since its API has none for it", async () => {
		await stripeRefund.act(refs, "refund", ctx, {
			amount: 2500,
			reason: "other",
		});
		expect(calls[0]?.body).toEqual({
			charge: "ch_oneoff1",
			amount: 2500,
			metadata: { superset_card: "card1" },
		});
	});

	test("a reply that fails after the money moved is a warning, not a second refund", async () => {
		replyFails = true;
		const { result } = await stripeRefund.act(refs, "refund", ctx, {
			amount: 4900,
			reply: { text: "Refunded.", version: "m2" },
		});
		expect(result.notice?.tone).toBe("warn");
		expect(result.notice?.text).toContain("The email reply was not sent");
		expect(calls).toHaveLength(1);
	});

	test("a retry after this card's refund went through does not refund again", async () => {
		lists.refunds = [
			{
				id: "re_1",
				amount: 2500,
				charge: "ch_oneoff1",
				metadata: { superset_card: "card1" },
			},
		];
		store["charges/ch_oneoff1"] = charge("ch_oneoff1", {
			amount_refunded: 2500,
		});
		await stripeRefund.act(refs, "refund", ctx, {
			amount: 2500,
			cancel: "sub_pro001",
		});
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			"DELETE subscriptions/sub_pro001",
		]);
	});

	test("a full refund whose cancellation failed can be finished, and closing the card reports the refund", async () => {
		fail = {
			path: /^subscriptions\//,
			error: new CardUnavailable("error", "Stripe is limiting requests"),
		};
		await expect(
			stripeRefund.act(refs, "refund", ctx, {
				amount: 4900,
				cancel: "sub_pro001",
			}),
		).rejects.toThrow(
			"Refunded $49.00 to Avery Chen (Visa •••• 4242). The subscription was not canceled: Stripe is limiting requests. Try again to finish",
		);
		fail = null;
		calls = [];
		lists.refunds = [
			{
				id: "re_1",
				amount: 4900,
				charge: "ch_oneoff1",
				metadata: { superset_card: "card1" },
			},
		];
		store["charges/ch_oneoff1"] = charge("ch_oneoff1", {
			amount_refunded: 4900,
		});
		const card = await stripeRefund.resolve(refs, ctx);
		expect(card.actions[0]?.disabled).toBeUndefined();
		const closed = await stripeRefund.act(refs, "dismiss", ctx, undefined);
		expect(closed.result.outcome).toEqual({ refunded: 4900 });
		const { result } = await stripeRefund.act(refs, "refund", ctx, {
			amount: 4900,
			cancel: "sub_pro001",
		});
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			"DELETE subscriptions/sub_pro001",
		]);
		expect(result.outcome).toMatchObject({ refunded: 4900 });
	});

	test("a reply to a thread that moved is refused before any money moves", async () => {
		await expect(
			stripeRefund.act(refs, "refund", ctx, {
				amount: 100,
				reply: { text: "x", version: "m1" },
			}),
		).rejects.toThrow("The email thread has a new message");
		expect(calls).toEqual([]);
	});

	test("in test mode a reply goes only to the reader's own address or an alias of it", async () => {
		readerEmail = "someone@else.com";
		await expect(
			stripeRefund.act(refs, "refund", ctx, {
				amount: 100,
				reply: { text: "x", version: "m2" },
			}),
		).rejects.toThrow("Test emails go only to your own address");
		expect(calls).toEqual([]);
	});

	test("a fully refunded charge, or an environment where writes are off, offers no refund", async () => {
		store["charges/ch_oneoff1"] = charge("ch_oneoff1", {
			amount_refunded: 4900,
		});
		expect((await stripeRefund.resolve(refs, ctx)).actions[0]?.disabled).toBe(
			"This charge has nothing left to refund",
		);
		store["charges/ch_oneoff1"] = charge("ch_oneoff1");
		writesOff = actualClient.LIVE_WRITES_OFF;
		expect((await stripeRefund.resolve(refs, ctx)).actions[0]?.disabled).toBe(
			actualClient.LIVE_WRITES_OFF,
		);
	});
});

describe("stripe.subscription", () => {
	const refs = {
		subscription: "sub_pro001",
		change: "cancel" as const,
		when: "now" as const,
		refund: "prorated" as const,
	};

	test("previews what cancelling now would return: the unused time and the last payment", async () => {
		const view = (await stripeSubscription.resolve(refs, ctx))
			.view as View<"stripe.subscription">;
		expect(view.preview.prorated).toEqual({ amount: 1342, currency: "usd" });
		expect(Math.abs(view.preview.prorationDate - NOW)).toBeLessThan(5);
		expect(view.preview.lastPayment).toEqual({
			amount: 2000,
			currency: "usd",
			charge: "ch_subpay1",
			card: { brand: "visa", last4: "4242" },
		});
		expect(view.proposed).toEqual({
			when: "now",
			refund: "prorated",
			resumesAt: null,
			behavior: "keep_as_draft",
		});
	});

	test("cancel now with a prorated refund: the refund the reader saw, then the cancellation", async () => {
		const at = NOW - 60;
		const { result } = await stripeSubscription.act(refs, "cancel", ctx, {
			when: "now",
			refund: "prorated",
			prorationDate: at,
			prorated: 1342,
		});
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			"POST refunds",
			"DELETE subscriptions/sub_pro001",
		]);
		expect(calls[0]?.body).toMatchObject({
			charge: "ch_subpay1",
			amount: 1342,
		});
		expect(calls[1]?.body).toEqual({ prorate: false, invoice_now: false });
		expect(result.notice?.text).toBe(
			"Canceled Pro and refunded $13.42 to Avery Chen (Visa •••• 4242)",
		);
	});

	test("a prorated amount that moved since the reader looked is refused", async () => {
		await expect(
			stripeSubscription.act(refs, "cancel", ctx, {
				when: "now",
				refund: "prorated",
				prorationDate: NOW - 60,
				prorated: 1500,
			}),
		).rejects.toThrow("The refund amount changed");
		await expect(
			stripeSubscription.act(refs, "cancel", ctx, {
				when: "now",
				refund: "prorated",
				prorationDate: NOW - 3600,
				prorated: 1342,
			}),
		).rejects.toThrow("The refund amount changed");
		expect(calls).toEqual([]);
	});

	test("a minute later the reader's amount is still the refund, to the cent they confirmed", async () => {
		await stripeSubscription.act(refs, "cancel", ctx, {
			when: "now",
			refund: "prorated",
			prorationDate: NOW - 60,
			prorated: 1343,
		});
		expect(calls[0]?.body).toMatchObject({ amount: 1343 });
	});

	test("a cancellation that fails after the refund says the money moved", async () => {
		fail = {
			path: /^subscriptions\//,
			error: new CardUnavailable("error", "Stripe is limiting requests"),
		};
		await expect(
			stripeSubscription.act(refs, "cancel", ctx, {
				when: "now",
				refund: "last_payment",
				charge: "ch_subpay1",
				amount: 2000,
			}),
		).rejects.toThrow(
			"Refunded $20.00 to Avery Chen (Visa •••• 4242). The subscription was not canceled: Stripe is limiting requests. Try again to finish",
		);
	});

	test("the whole last payment is refunded only on the charge and amount the reader saw", async () => {
		await expect(
			stripeSubscription.act(refs, "cancel", ctx, {
				when: "now",
				refund: "last_payment",
				charge: "ch_older001",
				amount: 2000,
			}),
		).rejects.toThrow("The refund amount changed");
		await expect(
			stripeSubscription.act(refs, "cancel", ctx, {
				when: "now",
				refund: "last_payment",
				charge: "ch_subpay1",
				amount: 500,
			}),
		).rejects.toThrow("The refund amount changed");
		expect(calls).toEqual([]);
		await stripeSubscription.act(refs, "cancel", ctx, {
			when: "now",
			refund: "last_payment",
			charge: "ch_subpay1",
			amount: 2000,
		});
		expect(calls[0]?.body).toMatchObject({
			charge: "ch_subpay1",
			amount: 2000,
		});
	});

	test("a subscription canceled by this card that never settled reports the truth when closed", async () => {
		store["subscriptions/sub_pro001"] = subscription("sub_pro001", {
			status: "canceled",
		});
		lists.refunds = [
			{
				id: "re_1",
				amount: 1342,
				charge: "ch_subpay1",
				metadata: { superset_card: "card1" },
			},
		];
		const card = await stripeSubscription.resolve(refs, ctx);
		expect(card.actions.map((action) => action.label)).toEqual(["Done"]);
		const { result } = await stripeSubscription.act(
			refs,
			"dismiss",
			ctx,
			undefined,
		);
		expect(result.outcome).toEqual({ canceled: true, refunded: 1342 });
	});

	test("cancel at the end of the period refunds nothing and deletes nothing", async () => {
		await stripeSubscription.act(refs, "cancel", ctx, {
			when: "period_end",
			refund: "none",
		});
		expect(calls).toEqual([
			{
				method: "POST",
				path: "subscriptions/sub_pro001",
				body: { cancel_at_period_end: true },
			},
		]);
		await expect(
			stripeSubscription.act(refs, "cancel", ctx, {
				when: "period_end",
				refund: "last_payment",
			}),
		).rejects.toThrow("A refund goes with cancelling now");
	});

	test("a cancellation that fails after the refund is retried without a second refund", async () => {
		lists.refunds = [
			{
				id: "re_1",
				amount: 1342,
				charge: "ch_subpay1",
				metadata: { superset_card: "card1" },
			},
		];
		store["charges/ch_subpay1"] = charge("ch_subpay1", {
			amount: 2000,
			amount_refunded: 1342,
		});
		const { result } = await stripeSubscription.act(refs, "cancel", ctx, {
			when: "now",
			refund: "prorated",
			prorated: 99,
		});
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			"DELETE subscriptions/sub_pro001",
		]);
		expect(result.outcome).toMatchObject({ refunded: 1342 });
	});

	test("pause takes Stripe's invoice behaviour and an end within a year", async () => {
		const until = new Date(Date.now() + 30 * DAY * 1000).toISOString();
		await stripeSubscription.act(refs, "pause", ctx, {
			resumesAt: until,
			behavior: "keep_as_draft",
		});
		expect(calls[0]?.body).toEqual({
			pause_collection: {
				behavior: "keep_as_draft",
				resumes_at: Math.floor(Date.parse(until) / 1000),
			},
		});
		await expect(
			stripeSubscription.act(refs, "pause", ctx, {
				resumesAt: "2001-01-01T00:00:00Z",
				behavior: "void",
			}),
		).rejects.toThrow("has passed");
		await expect(
			stripeSubscription.act(refs, "pause", ctx, {
				resumesAt: new Date(Date.now() + 400 * DAY * 1000).toISOString(),
				behavior: "void",
			}),
		).rejects.toThrow("a year at most");
	});

	test("a paused subscription offers resume, not pause", async () => {
		store["subscriptions/sub_pro001"] = subscription("sub_pro001", {
			pause_collection: { behavior: "void", resumes_at: null },
		});
		const card = await stripeSubscription.resolve(refs, ctx);
		expect(card.actions.map((action) => action.id)).toEqual([
			"cancel",
			"resume",
			"dismiss",
		]);
		await stripeSubscription.act(refs, "resume", ctx, undefined);
		expect(calls).toEqual([
			{
				method: "POST",
				path: "subscriptions/sub_pro001",
				body: { pause_collection: "" },
			},
		]);
	});
});

describe("stripe.adjust", () => {
	test("a coupon is added to the discounts the subscription already has; an expired one is not offered", async () => {
		const refs = {
			customer: "cus_avery1",
			adjust: "coupon" as const,
			coupon: "QUARTER",
		};
		const card = await stripeAdjust.resolve(refs, ctx);
		expect(
			(card.view as View<"stripe.adjust">).coupons.map((coupon) => coupon.id),
		).toEqual(["QUARTER"]);
		expect(card.actions.map((action) => action.id)).toEqual([
			"coupon",
			"dismiss",
		]);
		const { result } = await stripeAdjust.act(refs, "coupon", ctx, {
			coupon: "QUARTER",
		});
		expect(calls[0]?.body).toEqual({
			discounts: [{ discount: "di_old" }, { coupon: "QUARTER" }],
		});
		expect(result.notice?.text).toBe(
			"Applied 25% off for 3 months to Avery Chen",
		);
		await expect(
			stripeAdjust.act(refs, "coupon", ctx, { coupon: "EXPIRED" }),
		).rejects.toThrow("not one this account can still use");
	});

	test("a credit lowers the customer's balance by exactly the amount", async () => {
		const refs = {
			customer: "cus_avery1",
			adjust: "credit" as const,
			amount: 1000,
			note: "Outage",
		};
		const { result } = await stripeAdjust.act(refs, "credit", ctx, {
			amount: 1000,
			note: "Outage",
		});
		expect(calls[0]).toMatchObject({
			path: "customers/cus_avery1/balance_transactions",
			body: { amount: -1000, currency: "usd", description: "Outage" },
		});
		expect(result.notice?.text).toBe("Added $10.00 credit for Avery Chen");
		calls.length = 0;
		const debit = await stripeAdjust.act(refs, "credit", ctx, {
			amount: 1000,
			direction: "debit",
		});
		expect(calls[0]).toMatchObject({ body: { amount: 1000, currency: "usd" } });
		expect(debit.result.notice?.text).toBe(
			"Debited $10.00 from the credit balance of Avery Chen",
		);
		await expect(
			stripeAdjust.act(refs, "credit", ctx, { amount: -5 }),
		).rejects.toThrow();
	});

	test("a trial is extended from its current end, and only into the future", async () => {
		const trialing = subscription("sub_pro001", {
			status: "trialing",
			trial_end: NOW + 7 * DAY,
		});
		const [item] = trialing.items.data;
		if (item) item.current_period_end = NOW + 7 * DAY;
		store["subscriptions/sub_pro001"] = trialing;
		lists.subscriptions = [trialing];
		const refs = { customer: "cus_avery1", adjust: "trial" as const, days: 14 };
		const view = (await stripeAdjust.resolve(refs, ctx))
			.view as View<"stripe.adjust">;
		expect(
			Math.round((Date.parse(view.proposed.trialEnd ?? "") / 1000 - NOW) / DAY),
		).toBe(21);
		const end = new Date((NOW + 21 * DAY) * 1000).toISOString();
		await stripeAdjust.act(refs, "trial", ctx, { trialEnd: end });
		expect(calls[0]?.body).toEqual({
			trial_end: NOW + 21 * DAY,
			proration_behavior: "none",
		});
		await expect(
			stripeAdjust.act(refs, "trial", ctx, {
				trialEnd: "2001-01-01T00:00:00Z",
			}),
		).rejects.toThrow("has passed");
		await expect(
			stripeAdjust.act(refs, "trial", ctx, {
				trialEnd: new Date((NOW + 2 * DAY) * 1000).toISOString(),
			}),
		).rejects.toThrow("A trial can only move later");
		expect(calls).toHaveLength(1);
	});

	test("a trial on a paid subscription cannot end inside the period the customer paid for", async () => {
		const refs = {
			customer: "cus_avery1",
			adjust: "trial" as const,
			trial_end: new Date((NOW + 5 * DAY) * 1000).toISOString(),
		};
		const view = (await stripeAdjust.resolve(refs, ctx))
			.view as View<"stripe.adjust">;
		expect(view.proposed.trialEnd).toBeNull();
		await expect(
			stripeAdjust.act(refs, "trial", ctx, { trialEnd: refs.trial_end }),
		).rejects.toThrow("A trial can only move later");
		expect(calls).toEqual([]);
	});

	test("a credit this card already added is not added again", async () => {
		lists["customers/cus_avery1/balance_transactions"] = [
			{ amount: -1000, metadata: { superset_card: "card1" } },
		];
		const refs = { customer: "cus_avery1", adjust: "credit" as const };
		const { result } = await stripeAdjust.act(refs, "credit", ctx, {
			amount: 1000,
		});
		expect(calls).toEqual([]);
		expect(result.outcome).toEqual({ credited: 1000, currency: "usd" });
	});

	test("a customer with no charges takes a credit in the account's currency, not a guess", async () => {
		store["customers/cus_avery1"] = {
			...store["customers/cus_avery1"],
			currency: null,
		};
		lists.charges = [];
		const refs = { customer: "cus_avery1", adjust: "credit" as const };
		await stripeAdjust.act(refs, "credit", ctx, { amount: 500 });
		expect(calls[0]?.body).toMatchObject({ amount: -500, currency: "eur" });
	});

	test("a coupon the subscription already has is not stacked a second time", async () => {
		store["subscriptions/sub_pro001"] = {
			...subscription("sub_pro001"),
			discounts: [{ id: "di_1", source: { coupon: "QUARTER" } }],
		};
		const refs = { customer: "cus_avery1", adjust: "coupon" as const };
		await expect(
			stripeAdjust.act(refs, "coupon", ctx, { coupon: "QUARTER" }),
		).rejects.toThrow("already has that coupon");
		expect(calls).toEqual([]);
	});
});

describe("stripe.failed_payment", () => {
	const refs = {
		invoice: "in_failed1",
		email: "Hi Avery, your card was declined.",
	};

	test("shows why the payment failed, and the retry confirm names the amount, the customer and the card", async () => {
		const card = await stripeFailedPayment.resolve(refs, ctx);
		const view = card.view as View<"stripe.failed_payment">;
		expect(view.invoice.lastError).toBe("Your card was declined.");
		expect(view.email).toEqual({
			to: "satya+avery@superset.sh",
			subject: "Your payment of $20.00 did not go through",
			draft: "Hi Avery, your card was declined.",
			canSend: true,
		});
		expect(card.actions[0]?.confirm).toBe(
			"Charge $20.00 to Avery Chen's Visa •••• 4242 now?",
		);
	});

	test("retry pays the invoice; a decline keeps the card open with Stripe's reason", async () => {
		const paid = await stripeFailedPayment.act(refs, "retry", ctx, undefined);
		expect(calls[0]?.path).toBe("invoices/in_failed1/pay");
		expect(paid.result.notice?.text).toBe(
			"Charged $20.00 to Avery Chen's Visa •••• 4242",
		);
		fail = {
			path: /pay$/,
			error: new CardUnavailable("error", "Your card was declined."),
		};
		await expect(
			stripeFailedPayment.act(refs, "retry", ctx, undefined),
		).rejects.toThrow("Your card was declined.");
	});

	test("the email always carries the payment link, and goes to the customer's address", async () => {
		await stripeFailedPayment.act(refs, "send_link", ctx, {
			subject: "Payment failed",
			text: "Please update your card.",
		});
		expect(mails).toEqual([
			{
				to: ["satya+avery@superset.sh"],
				subject: "Payment failed",
				text: "Please update your card.\n\nhttps://invoice.stripe.com/i/test_1",
			},
		]);
		expect(calls).toEqual([]);
	});

	test("a test-mode customer with someone else's address is not emailed", async () => {
		store["customers/cus_avery1"] = {
			...store["customers/cus_avery1"],
			email: "real.person@example.com",
		};
		await expect(
			stripeFailedPayment.act(refs, "send_link", ctx, {
				subject: "s",
				text: "t",
			}),
		).rejects.toThrow("Test emails go only to your own address");
		expect(mails).toEqual([]);
	});

	test("a live key where writes are off still mails only the reader", async () => {
		live = true;
		writesOff = actualClient.LIVE_WRITES_OFF;
		store["customers/cus_avery1"] = {
			...store["customers/cus_avery1"],
			email: "real.person@example.com",
		};
		await expect(
			stripeFailedPayment.act(refs, "send_link", ctx, {
				subject: "s",
				text: "t",
			}),
		).rejects.toThrow("Test emails go only to your own address");
		expect(mails).toEqual([]);
	});

	test("a customer address that holds two addresses is not mailed", async () => {
		store["customers/cus_avery1"] = {
			...store["customers/cus_avery1"],
			email: "<satya@superset.sh>, victim@example.com",
		};
		await expect(
			stripeFailedPayment.act(refs, "send_link", ctx, {
				subject: "s",
				text: "t",
			}),
		).rejects.toThrow("is not one email address");
		store["customers/cus_avery1"] = {
			...store["customers/cus_avery1"],
			email: "victim@example.com, <satya@superset.sh>",
		};
		await expect(
			stripeFailedPayment.act(refs, "send_link", ctx, {
				subject: "s",
				text: "t",
			}),
		).rejects.toThrow("is not one email address");
		expect(mails).toEqual([]);
	});

	test("the retry names the payment method Stripe charges: the invoice's, then the subscription's, then the customer's", async () => {
		store["invoices/in_failed1"] = invoice("in_failed1", {
			default_payment_method: null,
			parent: {
				subscription_details: {
					subscription: {
						default_payment_method: {
							id: "pm_sub",
							card: { brand: "mastercard", last4: "5100" },
						},
					},
				},
			},
		});
		const card = await stripeFailedPayment.resolve(refs, ctx);
		expect((card.view as View<"stripe.failed_payment">).charged).toEqual({
			brand: "mastercard",
			last4: "5100",
		});
		expect(card.actions[0]?.confirm).toBe(
			"Charge $20.00 to Avery Chen's Mastercard •••• 5100 now?",
		);
	});

	test("a second retry after a decline is a new request to Stripe, not a replay of the first", async () => {
		await stripeFailedPayment.act(refs, "retry", ctx, undefined);
		const failed = invoice("in_failed1");
		const [entry] = failed.payments.data;
		if (entry) entry.payment.payment_intent.latest_charge = "ch_failed02";
		store["invoices/in_failed1"] = failed;
		await stripeFailedPayment.act(refs, "retry", ctx, undefined);
		expect(calls[0]?.key).toBeTruthy();
		expect(calls[1]?.key).not.toBe(calls[0]?.key);
	});

	test("a partly paid invoice charges only what remains", async () => {
		store["invoices/in_failed1"] = invoice("in_failed1", {
			amount_paid: 500,
			amount_remaining: 1500,
		});
		const card = await stripeFailedPayment.resolve(refs, ctx);
		expect(card.actions[0]?.confirm).toBe(
			"Charge $15.00 to Avery Chen's Visa •••• 4242 now?",
		);
	});

	test("a paid invoice offers neither", async () => {
		store["invoices/in_failed1"] = invoice("in_failed1", { status: "paid" });
		const card = await stripeFailedPayment.resolve(refs, ctx);
		expect(card.actions.slice(0, 2).map((action) => action.disabled)).toEqual([
			"This invoice is already paid",
			"This invoice is already paid",
		]);
	});
});

describe("stripe.dispute", () => {
	const refs = {
		dispute: "du_dispute1",
		uncategorized_text: "The customer used the product for 40 days.",
		customer_name: "Agent Guess",
	};
	beforeEach(() => {
		store["disputes/du_dispute1"] = {
			id: "du_dispute1",
			amount: 12900,
			currency: "usd",
			reason: "fraudulent",
			status: "needs_response",
			created: NOW - DAY,
			charge: charge("ch_disputed", { amount: 12900, disputed: true }),
			evidence: { customer_name: "Avery Chen", uncategorized_text: null },
			evidence_details: {
				due_by: NOW + 8 * DAY,
				past_due: false,
				submission_count: 0,
			},
		};
	});

	test("Stripe's own evidence wins; the agent's draft fills only what Stripe lacks, and is marked", async () => {
		const card = await stripeDispute.resolve(refs, ctx);
		const view = card.view as View<"stripe.dispute">;
		expect(view.evidence.customer_name).toBe("Avery Chen");
		expect(view.evidence.uncategorized_text).toBe(
			"The customer used the product for 40 days.",
		);
		expect(view.drafted).toEqual(["uncategorized_text"]);
		expect(card.actions.map((action) => action.confirm ?? null)).toEqual([
			"Submit this evidence to the bank for the $129.00 dispute on Avery Chen's Visa •••• 4242 charge? Evidence can be submitted once. Countering a dispute has a fee in addition to the dispute fee. You get it back if you win.",
			null,
			"Accept the $129.00 dispute on Avery Chen's Visa •••• 4242 charge? You lose this dispute and the customer is refunded. This closes the dispute and you can no longer submit evidence.",
		]);
		expect(view.dispute.inquiry).toBe(false);
	});

	test("an inquiry is not a dispute yet: it is answered or refunded, never accepted, and the confirm says no money has moved", async () => {
		store["disputes/du_dispute1"] = {
			...(store["disputes/du_dispute1"] as Row),
			status: "warning_needs_response",
		};
		const card = await stripeDispute.resolve(refs, ctx);
		expect((card.view as View<"stripe.dispute">).dispute.inquiry).toBe(true);
		expect(card.status).toEqual({ tone: "warn", text: "Inquiry" });
		expect(
			card.actions.map((action) => [action.id, action.label, action.confirm]),
		).toEqual([
			[
				"submit",
				"Respond to inquiry",
				"Send this response to the bank for the $129.00 inquiry on Avery Chen's Visa •••• 4242 charge? A response can be sent once.",
			],
			["save", "Save draft", undefined],
			[
				"refund",
				"Refund customer",
				"Refund $129.00 on Avery Chen's Visa •••• 4242 charge? A full refund resolves the inquiry. No money has left your account for it yet.",
			],
		]);
		const { result } = await stripeDispute.act(refs, "refund", ctx, undefined);
		expect(calls).toEqual([
			expect.objectContaining({
				method: "POST",
				path: "refunds",
				body: expect.objectContaining({ charge: "ch_disputed", amount: 12900 }),
			}),
		]);
		expect(result.notice?.text).toBe("Refunded $129.00 to resolve the inquiry");
		await expect(
			stripeDispute.act(refs, "accept", ctx, undefined),
		).rejects.toThrow();
		store["disputes/du_dispute1"] = {
			...(store["disputes/du_dispute1"] as Row),
			status: "warning_closed",
		};
		expect((await stripeDispute.resolve(refs, ctx)).status?.text).toBe(
			"Inquiry closed",
		);
	});

	test("save keeps the card open; submit sends the reader's text and settles it", async () => {
		const saved = await stripeDispute.act(refs, "save", ctx, {
			evidence: { uncategorized_text: "Edited." },
		});
		const sent = await stripeDispute.act(refs, "submit", ctx, {
			evidence: { uncategorized_text: "Edited." },
		});
		expect(calls).toEqual([
			{
				method: "POST",
				path: "disputes/du_dispute1",
				body: { evidence: { uncategorized_text: "Edited." }, submit: false },
			},
			{
				method: "POST",
				path: "disputes/du_dispute1",
				body: { evidence: { uncategorized_text: "Edited." }, submit: true },
			},
		]);
		expect(saved.result.terminal).toBe(false);
		expect(sent.result.terminal).toBe(true);
	});

	test("accept closes the dispute; a dispute past its deadline takes nothing", async () => {
		await stripeDispute.act(refs, "accept", ctx, undefined);
		expect(calls).toEqual([
			{ method: "POST", path: "disputes/du_dispute1/close" },
		]);
		(
			store["disputes/du_dispute1"] as { evidence_details: Row }
		).evidence_details.past_due = true;
		const card = await stripeDispute.resolve(refs, ctx);
		expect(
			card.actions.every(
				(action) => action.disabled === "The deadline for evidence has passed",
			),
		).toBe(true);
	});
});

describe("stripe.invoice", () => {
	test("a draft is finalized, then sent; the confirm names the amount and the address", async () => {
		const refs = { invoice: "in_draft01" };
		const card = await stripeInvoice.resolve(refs, ctx);
		expect(card.actions.map((action) => action.id)).toEqual([
			"send",
			"dismiss",
		]);
		expect(card.actions[0]?.confirm).toBe(
			"Send this draft invoice for $300.00 to Avery Chen at satya+avery@superset.sh?",
		);
		await stripeInvoice.act(refs, "send", ctx, undefined);
		expect(calls.map((call) => call.path)).toEqual([
			"invoices/in_draft01/finalize",
			"invoices/in_draft01/send",
		]);
	});

	test("an open invoice can be marked paid outside Stripe or voided, each saying so first", async () => {
		const refs = { invoice: "in_failed1" };
		const card = await stripeInvoice.resolve(refs, ctx);
		expect(card.actions.map((action) => action.id)).toEqual([
			"send",
			"mark_paid",
			"void",
			"mark_uncollectible",
			"dismiss",
		]);
		expect(card.actions[3]?.confirm).toBe(
			"Mark INV-0001 for $20.00 as uncollectible? It is no longer open, and after this it can only be marked paid or void.",
		);
		expect(card.actions[1]?.confirm).toBe(
			"Mark INV-0001 for $20.00 as paid outside Stripe? No card is charged and Avery Chen owes nothing more on it.",
		);
		expect(card.actions[2]?.confirm).toBe(
			"Void INV-0001 for $20.00? Avery Chen can no longer pay it, and this cannot be undone.",
		);
		await stripeInvoice.act(refs, "mark_paid", ctx, undefined);
		await stripeInvoice.act(refs, "void", ctx, undefined);
		expect(
			calls.map((call) => `${call.path} ${JSON.stringify(call.body ?? null)}`),
		).toEqual([
			'invoices/in_failed1/pay {"paid_out_of_band":true}',
			"invoices/in_failed1/void null",
		]);
		calls = [];
		const { result } = await stripeInvoice.act(
			refs,
			"mark_uncollectible",
			ctx,
			undefined,
		);
		expect(calls.map((call) => call.path)).toEqual([
			"invoices/in_failed1/mark_uncollectible",
		]);
		expect(result.notice?.text).toBe(
			"Marked the invoice for $20.00 as uncollectible",
		);
	});

	test("an invoice Stripe charges by itself is not finalized just to fail at sending", async () => {
		store["invoices/in_draft01"] = invoice("in_draft01", {
			status: "draft",
			number: null,
			collection_method: "charge_automatically",
		});
		const card = await stripeInvoice.resolve({ invoice: "in_draft01" }, ctx);
		expect(card.actions[0]?.disabled).toBe(
			"Stripe charges this invoice automatically, so it is not sent for payment",
		);
		await expect(
			stripeInvoice.act({ invoice: "in_draft01" }, "send", ctx, undefined),
		).rejects.toThrow("Stripe charges this invoice automatically");
		expect(calls).toEqual([]);
	});

	test("a finalized invoice names the address Stripe holds on it, not the customer's newer one", async () => {
		store["invoices/in_failed1"] = invoice("in_failed1", {
			collection_method: "send_invoice",
			customer_email: "satya+billing@superset.sh",
		});
		const card = await stripeInvoice.resolve({ invoice: "in_failed1" }, ctx);
		expect((card.view as View<"stripe.invoice">).to).toBe(
			"satya+billing@superset.sh",
		);
		expect(card.actions[0]?.confirm).toBe(
			"Send INV-0001 for $20.00 to Avery Chen at satya+billing@superset.sh?",
		);
	});

	test("an action is refused when its sentence is not the one the reader confirmed", async () => {
		const raw = (await import("./stripeInvoice")).stripeInvoice;
		const refs = { invoice: "in_failed1" };
		await expect(
			raw.act(refs, "void", ctx, undefined, "Void INV-0001 for $10.00?"),
		).rejects.toThrow("This changed since you looked");
		await expect(raw.act(refs, "void", ctx, undefined)).rejects.toThrow(
			"This changed since you looked",
		);
		expect(calls).toEqual([]);
	});

	test("a paid invoice takes no action", async () => {
		store["invoices/in_failed1"] = invoice("in_failed1", { status: "paid" });
		const card = await stripeInvoice.resolve({ invoice: "in_failed1" }, ctx);
		expect(card.actions.slice(0, 3).map((action) => action.disabled)).toEqual([
			"This invoice is already paid",
			"This invoice is already paid",
			"This invoice is already paid",
		]);
	});
});

describe("money", () => {
	test("uses the currency's own decimals", async () => {
		const { mailbox, money, sameMailbox } = await import("./stripeCustomer");
		expect(money(2000, "usd")).toBe("$20.00");
		expect(money(2000, "jpy")).toBe("¥2,000");
		expect(money(200000, "isk")).toBe("ISK\u00a02,000");
		expect(money(500000, "ugx")).toBe("UGX\u00a05,000");
		expect(money(5000, "mga")).toBe("MGA\u00a05,000");
		expect(money(1500, "kwd")).toBe("KWD\u00a01.500");
		expect(sameMailbox("Satya+Avery@Superset.sh", "satya@superset.sh")).toBe(
			true,
		);
		expect(sameMailbox("satya@superset.sh.evil.com", "satya@superset.sh")).toBe(
			false,
		);
		expect(sameMailbox("notsatya@superset.sh", "satya@superset.sh")).toBe(
			false,
		);
		expect(mailbox('"<satya@superset.sh>" <victim@example.com>')).toBe(
			"victim@example.com",
		);
		expect(mailbox("<satya@superset.sh>, victim@example.com")).toBeNull();
		expect(mailbox("Avery <satya+avery@superset.sh>")).toBe(
			"satya+avery@superset.sh",
		);
	});
});
