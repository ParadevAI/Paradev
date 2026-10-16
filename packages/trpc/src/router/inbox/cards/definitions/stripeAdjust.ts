import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type StripeAdjustView,
	type StripeCouponView,
	withInput,
} from "../types";
import { idempotencyKey, type StripeApi, stripeFor } from "./stripeClient";
import {
	accountView,
	CUSTOMER_ID,
	type CustomerFacts,
	customerName,
	loadCustomer,
	money,
	type RawSubscription,
	SUBSCRIPTION_ID,
	writable,
} from "./stripeCustomer";

interface Refs {
	customer: string;
	adjust: "coupon" | "credit" | "trial";
	subscription?: string;
	coupon?: string;
	amount?: number;
	direction?: "credit" | "debit";
	note?: string;
	trial_end?: string;
	days?: number;
}

interface RawCoupon {
	id: string;
	name: string | null;
	percent_off: number | null;
	amount_off: number | null;
	currency: string | null;
	duration: StripeCouponView["duration"];
	duration_in_months: number | null;
	valid: boolean;
}

interface Data {
	api: StripeApi;
	adjust: Refs["adjust"];
	customer: CustomerFacts;
	subscription: RawSubscription | null;
	coupons: RawCoupon[];
	currency: string;
	credited: { amount: number } | null;
}

interface RawBalanceTransaction {
	amount: number;
	metadata: Record<string, string> | null;
}

interface RawDiscount {
	source?: { coupon?: string | { id: string } | null } | null;
}

const NOTE_MAX = 350;
const CREDIT_MAX = 100_000_00;
const TRIAL_DAYS_MAX = 730;
const DAY_MS = 24 * 60 * 60 * 1000;
const COUPON_ID = /^[A-Za-z0-9_-]{1,100}$/;

const onlyFor = (kind: Refs["adjust"]) => (data: Data) => data.adjust === kind;

function target(data: Data, id: string | undefined): RawSubscription {
	const subscription = data.customer.subscriptions.find(
		(item) =>
			item.id === (id ?? data.subscription?.id) && item.status !== "canceled",
	);
	if (!subscription)
		throw new CardUnavailable(
			"error",
			"That subscription is not one this customer has",
		);
	return subscription;
}

/** A trial end before this would cut a trial short, or end a period the customer has paid for. */
function trialFloor(subscription: RawSubscription): number {
	return Math.max(
		subscription.trial_end ?? 0,
		subscription.items.data[0]?.current_period_end ?? 0,
	);
}

const day = (time: number) =>
	new Intl.DateTimeFormat("en-US", {
		dateStyle: "medium",
		timeZone: "UTC",
	}).format(time);

const TRIAL_ONLY_LATER =
	"A trial can only move later than the time the customer already has";

function toCoupon(coupon: RawCoupon): StripeCouponView {
	return {
		id: coupon.id,
		name: coupon.name ?? coupon.id,
		percentOff: coupon.percent_off,
		amountOff:
			coupon.amount_off && coupon.currency
				? { amount: coupon.amount_off, currency: coupon.currency }
				: null,
		duration: coupon.duration,
		months: coupon.duration_in_months,
	};
}

export function couponTerms(coupon: StripeCouponView): string {
	const off =
		coupon.percentOff !== null
			? `${coupon.percentOff}% off`
			: coupon.amountOff
				? `${money(coupon.amountOff.amount, coupon.amountOff.currency)} off`
				: "a discount";
	const length =
		coupon.duration === "forever"
			? "forever"
			: coupon.duration === "once"
				? "once"
				: `for ${coupon.months} months`;
	return `${off} ${length}`;
}

export const stripeAdjust = defineCard<Refs, Data>({
	type: "stripe.adjust",
	label: "Stripe account adjustment",
	ask: "Approve adjustment",
	brand: "stripe",
	refs: z.object({
		customer: z.string().regex(CUSTOMER_ID),
		adjust: z.enum(["coupon", "credit", "trial"]),
		subscription: z.string().regex(SUBSCRIPTION_ID).optional(),
		coupon: z.string().regex(COUPON_ID).optional(),
		amount: z.number().int().positive().max(CREDIT_MAX).optional(),
		/** A debit raises what the customer owes; without it the amount is a credit. */
		direction: z.enum(["credit", "debit"]).optional(),
		note: z.string().max(NOTE_MAX).optional(),
		trial_end: z.string().datetime({ offset: true }).optional(),
		/** Days to add to the trial, counted from its current end or from now. */
		days: z.number().int().positive().max(TRIAL_DAYS_MAX).optional(),
	}),
	async resolve({ refs, ctx }) {
		const api = await stripeFor(ctx);
		const [customer, coupons, credits] = await Promise.all([
			loadCustomer(api, refs.customer),
			refs.adjust === "coupon"
				? api.get<{ data: RawCoupon[] }>("coupons", { limit: 50 })
				: { data: [] },
			refs.adjust === "credit" && ctx.card
				? api.get<{ data: RawBalanceTransaction[] }>(
						`customers/${refs.customer}/balance_transactions`,
						{ limit: 20 },
					)
				: { data: [] },
		]);
		const open = customer.subscriptions.filter(
			(item) =>
				item.status !== "canceled" && item.status !== "incomplete_expired",
		);
		const subscription =
			open.find((item) => item.id === refs.subscription) ??
			(open.length === 1 ? (open[0] ?? null) : null);
		const shown =
			customer.view.subscriptions.find(
				(item) => item.id === subscription?.id,
			) ?? null;
		const valid = coupons.data.filter((coupon) => coupon.valid);
		const floor = subscription ? trialFloor(subscription) * 1000 : 0;
		const base = Math.max(Date.now(), floor);
		const wanted = refs.trial_end
			? Date.parse(refs.trial_end)
			: refs.days
				? base + refs.days * DAY_MS
				: null;
		const currency = customer.currency;
		const view: StripeAdjustView = {
			kind: "stripe.adjust",
			account: accountView(api),
			customer: customer.view,
			adjust: refs.adjust,
			subscription: shown,
			coupons: valid.map(toCoupon),
			proposed: {
				coupon: valid.some((coupon) => coupon.id === refs.coupon)
					? (refs.coupon ?? null)
					: null,
				credit: refs.amount ? { amount: refs.amount, currency } : null,
				direction: refs.direction ?? "credit",
				note: refs.note ?? "",
				trialEnd:
					wanted !== null && wanted > base
						? new Date(wanted).toISOString()
						: null,
			},
		};
		const who = customerName(customer.view);
		const fields: CardField[] = [
			{ label: "Customer", value: who },
			...(shown ? [{ label: "Plan", value: shown.product }] : []),
			{
				label: "Paid",
				value: `${money(customer.view.spent.amount, currency)}${customer.view.spentPartial ? "+" : ""}`,
			},
			...(api.live ? [] : [{ label: "Mode", value: "Test" }]),
		];
		return {
			title: who,
			subtitle:
				refs.adjust === "coupon"
					? "Coupon"
					: refs.adjust === "credit"
						? "Credit"
						: "Trial",
			fields,
			view,
			data: {
				api,
				adjust: refs.adjust,
				customer,
				subscription,
				coupons: valid,
				currency,
				credited:
					credits.data.find(
						(item) => item.metadata?.superset_card === ctx.card?.id,
					) ?? null,
			},
		};
	},
	actions: {
		coupon: {
			label: () => "Apply coupon",
			style: "primary",
			role: "primary",
			applies: onlyFor("coupon"),
			available: (data) =>
				data.customer.view.subscriptions.length === 0
					? "This customer has no subscription to discount"
					: writable(data.api),
			run: withInput(
				z.object({
					coupon: z.string().regex(COUPON_ID),
					subscription: z.string().regex(SUBSCRIPTION_ID).optional(),
				}),
				async ({ data, ctx, input }) => {
					const coupon = data.coupons.find((item) => item.id === input.coupon);
					if (!coupon)
						throw new CardUnavailable(
							"error",
							"That coupon is not one this account can still use",
						);
					const subscription = target(data, input.subscription);
					const held = await data.api.get<{ discounts: RawDiscount[] }>(
						`subscriptions/${subscription.id}`,
						{ expand: ["discounts"] },
					);
					const has = held.discounts.some((discount) => {
						const source = discount.source?.coupon;
						return (
							(typeof source === "string" ? source : source?.id) === coupon.id
						);
					});
					if (has)
						throw new CardUnavailable(
							"error",
							"This subscription already has that coupon",
						);
					await data.api.post(
						`subscriptions/${subscription.id}`,
						{
							discounts: [
								...subscription.discounts.map((discount) => ({
									discount:
										typeof discount === "string" ? discount : discount.id,
								})),
								{ coupon: coupon.id },
							],
						},
						idempotencyKey(ctx, ["coupon", subscription.id, coupon.id]),
					);
					return {
						outcome: { coupon: coupon.id, subscription: subscription.id },
						notice: {
							tone: "good",
							text: `Applied ${couponTerms(toCoupon(coupon))} to ${customerName(data.customer.view)}`,
						},
					};
				},
			),
		},
		credit: {
			label: () => "Apply to credit balance",
			style: "primary",
			role: "primary",
			applies: onlyFor("credit"),
			available: (data) => writable(data.api),
			run: withInput(
				z.object({
					amount: z.number().int().positive().max(CREDIT_MAX),
					direction: z.enum(["credit", "debit"]).default("credit"),
					note: z.string().trim().max(NOTE_MAX).optional(),
				}),
				async ({ data, ctx, input }) => {
					const change =
						data.credited?.amount ??
						(input.direction === "debit" ? input.amount : -input.amount);
					if (!data.credited)
						await data.api.post(
							`customers/${data.customer.customer.id}/balance_transactions`,
							{
								amount: change,
								currency: data.currency,
								...(input.note ? { description: input.note } : {}),
								metadata: { superset_card: ctx.card?.id ?? "" },
							},
							idempotencyKey(ctx, [
								input.direction,
								data.customer.customer.id,
								input.amount,
							]),
						);
					return {
						outcome: { credited: -change, currency: data.currency },
						notice: {
							tone: "good",
							text:
								change < 0
									? `Added ${money(-change, data.currency)} credit for ${customerName(data.customer.view)}`
									: `Debited ${money(change, data.currency)} from the credit balance of ${customerName(data.customer.view)}`,
						},
					};
				},
			),
		},
		trial: {
			label: () => "Extend trial",
			style: "primary",
			role: "primary",
			applies: onlyFor("trial"),
			available: (data) =>
				data.customer.view.subscriptions.length === 0
					? "This customer has no subscription to put on trial"
					: writable(data.api),
			run: withInput(
				z.object({
					trialEnd: z.string().datetime({ offset: true }),
					subscription: z.string().regex(SUBSCRIPTION_ID).optional(),
				}),
				async ({ data, input }) => {
					const end = Date.parse(input.trialEnd);
					if (end <= Date.now())
						throw new CardUnavailable("error", "That time has passed");
					if (end > Date.now() + TRIAL_DAYS_MAX * DAY_MS)
						throw new CardUnavailable(
							"error",
							"A trial ends within two years at most",
						);
					const subscription = target(data, input.subscription);
					if (end <= trialFloor(subscription) * 1000)
						throw new CardUnavailable("error", TRIAL_ONLY_LATER);
					await data.api.post(`subscriptions/${subscription.id}`, {
						trial_end: Math.floor(end / 1000),
						proration_behavior: "none",
					});
					return {
						outcome: {
							trialEnd: new Date(end).toISOString(),
							subscription: subscription.id,
						},
						notice: {
							tone: "good",
							text: `Trial for ${customerName(data.customer.view)} now ends ${day(end)}`,
						},
					};
				},
			),
		},
		dismiss: {
			label: () => "Keep as is",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { changed: false } };
			},
		},
	},
});
