import { db } from "@superset/db/client";
import { users } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import {
	type CardContext,
	CardUnavailable,
	type StripeCardView,
	type StripeChargeView,
	type StripeCustomerView,
	type StripeInvoiceView,
	type StripeSubscriptionView,
} from "../types";
import type { StripeApi } from "./stripeClient";

export const CUSTOMER_ID = /^cus_[A-Za-z0-9]{6,64}$/;
export const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]{6,64}$/;
export const CHARGE_REF = /^(ch|py|pi)_[A-Za-z0-9]{6,64}$/;
export const INVOICE_ID = /^in_[A-Za-z0-9]{6,64}$/;
export const DISPUTE_ID = /^(du|dp)_[A-Za-z0-9]{6,64}$/;
export const DRAFT_MAX = 8000;

const CHARGES_READ = 100;
const CHARGES_SHOWN = 5;

interface RawCard {
	brand?: string | null;
	last4?: string | null;
	exp_month?: number | null;
	exp_year?: number | null;
}

export interface RawPaymentMethod {
	id: string;
	card?: RawCard | null;
}

export interface RawCharge {
	id: string;
	amount: number;
	amount_refunded: number;
	currency: string;
	status: "succeeded" | "pending" | "failed";
	created: number;
	description: string | null;
	disputed: boolean;
	customer: string | null;
	payment_intent: string | null;
	payment_method_details?: { card?: RawCard | null } | null;
}

export interface RawSubscription {
	id: string;
	status: string;
	customer: string;
	cancel_at_period_end: boolean;
	cancel_at: number | null;
	trial_end: number | null;
	pause_collection: { behavior: string; resumes_at: number | null } | null;
	discounts: (string | { id: string })[];
	latest_invoice: string | null;
	items: {
		data: {
			quantity: number | null;
			current_period_start: number;
			current_period_end: number;
			price: {
				unit_amount: number | null;
				currency: string;
				product: string;
				nickname: string | null;
				recurring: { interval: string; interval_count: number } | null;
			};
		}[];
	};
}

export interface RawCustomer {
	id: string;
	name: string | null;
	email: string | null;
	created: number;
	balance: number;
	currency: string | null;
	delinquent: boolean | null;
	deleted?: boolean;
	invoice_settings?: {
		default_payment_method?: RawPaymentMethod | string | null;
	} | null;
}

export interface RawInvoice {
	id: string;
	number: string | null;
	status: StripeInvoiceView["status"] | null;
	customer: string;
	customer_email: string | null;
	amount_due: number;
	amount_paid: number;
	amount_remaining: number;
	total: number;
	currency: string;
	created: number;
	due_date: number | null;
	collection_method: StripeInvoiceView["collection"];
	attempt_count: number;
	next_payment_attempt: number | null;
	hosted_invoice_url: string | null;
	default_payment_method?: RawPaymentMethod | string | null;
	parent?: {
		subscription_details?: {
			subscription?:
				| { default_payment_method?: RawPaymentMethod | string | null }
				| string
				| null;
		} | null;
	} | null;
	lines: { data: { description: string | null; amount: number }[] };
	payments?: {
		data: {
			status?: string;
			payment: {
				payment_intent?:
					| {
							id: string;
							latest_charge: string | null;
							last_payment_error?: { message?: string } | null;
					  }
					| string
					| null;
			};
		}[];
	} | null;
}

interface List<T> {
	data: T[];
	has_more: boolean;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const isoOrNull = (seconds: number | null | undefined) =>
	seconds ? iso(seconds) : null;

const ZERO_DECIMAL = new Set(
	"BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF VND VUV XAF XOF XPF".split(" "),
);
const THREE_DECIMAL = new Set("BHD JOD KWD OMR TND".split(" "));

/** Stripe's smallest unit is not ISO's: ISK and UGX amounts carry two decimals that are never shown. The sentences are English, as the cards' other fixed labels are. */
export function money(amount: number, currency: string): string {
	const code = currency.toUpperCase();
	const exponent = ZERO_DECIMAL.has(code) ? 0 : THREE_DECIMAL.has(code) ? 3 : 2;
	const shown = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: code,
	}).resolvedOptions().maximumFractionDigits;
	const digits = Math.min(exponent, shown ?? exponent);
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: code,
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}).format(amount / 10 ** exponent);
}

export function toCard(
	card: RawCard | null | undefined,
): StripeCardView | null {
	return card?.brand && card.last4
		? {
				brand: card.brand,
				last4: card.last4,
				...(card.exp_month && card.exp_year
					? { expMonth: card.exp_month, expYear: card.exp_year }
					: {}),
			}
		: null;
}

export function cardLabel(card: StripeCardView | null): string {
	if (!card) return "the payment method on file";
	const brand = card.brand.charAt(0).toUpperCase() + card.brand.slice(1);
	return `${brand} •••• ${card.last4}`;
}

export function toCharge(charge: RawCharge, api: StripeApi): StripeChargeView {
	return {
		id: charge.id,
		amount: charge.amount,
		refunded: charge.amount_refunded,
		currency: charge.currency,
		status: charge.status,
		created: iso(charge.created),
		description: charge.description,
		card: toCard(charge.payment_method_details?.card),
		disputed: charge.disputed,
		url: api.url(`payments/${charge.payment_intent ?? charge.id}`),
	};
}

export function toSubscription(
	subscription: RawSubscription,
	products: Map<string, string>,
	api: StripeApi,
): StripeSubscriptionView {
	const items = subscription.items.data;
	const item = items[0];
	const price = item?.price;
	return {
		id: subscription.id,
		status: subscription.status,
		product:
			(price && products.get(price.product)) ??
			price?.nickname ??
			"Subscription",
		price: {
			amount: items.reduce(
				(sum, each) =>
					sum + (each.price.unit_amount ?? 0) * (each.quantity ?? 1),
				0,
			),
			currency: price?.currency ?? "usd",
			interval: price?.recurring?.interval ?? "month",
			intervalCount: price?.recurring?.interval_count ?? 1,
		},
		quantity: item?.quantity ?? 1,
		items: items.length,
		metered: items.some((each) => each.price.unit_amount === null),
		currentPeriodStart: iso(item?.current_period_start ?? 0),
		currentPeriodEnd: iso(item?.current_period_end ?? 0),
		cancelAtPeriodEnd: subscription.cancel_at_period_end,
		cancelAt: isoOrNull(subscription.cancel_at),
		trialEnd: isoOrNull(subscription.trial_end),
		paused: subscription.pause_collection
			? { resumesAt: isoOrNull(subscription.pause_collection.resumes_at) }
			: null,
		discounts: subscription.discounts.map((discount) =>
			typeof discount === "string" ? discount : discount.id,
		),
		url: api.url(`subscriptions/${subscription.id}`),
	};
}

export function statusLabel(status: string): string {
	const words = status.replace(/_/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export function priceLabel(subscription: StripeSubscriptionView): string {
	const { amount, currency, interval, intervalCount } = subscription.price;
	const every =
		intervalCount > 1 ? `every ${intervalCount} ${interval}s` : `/ ${interval}`;
	return subscription.metered && amount === 0
		? `Usage-based ${every}`
		: `${money(amount, currency)} ${every}`;
}

export function toInvoice(
	invoice: RawInvoice,
	api: StripeApi,
): StripeInvoiceView {
	const failure = (invoice.payments?.data ?? [])
		.map(({ payment }) => payment.payment_intent)
		.filter(
			(intent) =>
				typeof intent === "object" && Boolean(intent?.last_payment_error),
		)
		.at(-1);
	return {
		id: invoice.id,
		number: invoice.number,
		status: invoice.status ?? "draft",
		amountDue: invoice.amount_due,
		amountPaid: invoice.amount_paid,
		amountRemaining: invoice.amount_remaining,
		total: invoice.total,
		currency: invoice.currency,
		created: iso(invoice.created),
		dueDate: isoOrNull(invoice.due_date),
		collection: invoice.collection_method,
		lines: invoice.lines.data.map((line) => ({
			description: line.description ?? "",
			amount: line.amount,
		})),
		attempts: invoice.attempt_count,
		nextAttempt: isoOrNull(invoice.next_payment_attempt),
		lastError:
			typeof failure === "object" && failure
				? (failure.last_payment_error?.message ?? null)
				: null,
		hostedUrl: invoice.hosted_invoice_url,
		url: api.url(`invoices/${invoice.id}`),
	};
}

export interface CustomerFacts {
	view: StripeCustomerView;
	customer: RawCustomer;
	subscriptions: RawSubscription[];
	charges: RawCharge[];
	products: Map<string, string>;
	currency: string;
}

export async function loadCustomer(
	api: StripeApi,
	customerId: string,
): Promise<CustomerFacts> {
	const [customer, subscriptions, charges] = await Promise.all([
		api.get<RawCustomer>(`customers/${customerId}`, {
			expand: ["invoice_settings.default_payment_method"],
		}),
		api.get<List<RawSubscription>>("subscriptions", {
			customer: customerId,
			status: "all",
			limit: 20,
			expand: ["data.items.data.price"],
		}),
		api.get<List<RawCharge>>("charges", {
			customer: customerId,
			limit: CHARGES_READ,
		}),
	]);
	if (customer.deleted)
		throw new CardUnavailable("gone", "That customer was deleted in Stripe");
	const productIds = [
		...new Set(
			subscriptions.data.flatMap((subscription) =>
				subscription.items.data.map((item) => item.price.product),
			),
		),
	];
	const products = new Map<string, string>();
	if (productIds.length) {
		const listed = await api.get<List<{ id: string; name: string }>>(
			"products",
			{ ids: productIds, limit: 100 },
		);
		for (const product of listed.data) products.set(product.id, product.name);
	}
	const currency =
		customer.currency ??
		charges.data[0]?.currency ??
		(await api.get<{ default_currency: string }>("account")).default_currency;
	const paid = charges.data.filter(
		(charge) => charge.status === "succeeded" && charge.currency === currency,
	);
	const method = customer.invoice_settings?.default_payment_method;
	const live = subscriptions.data.filter(
		(subscription) =>
			subscription.status !== "canceled" &&
			subscription.status !== "incomplete_expired",
	);
	return {
		view: {
			id: customer.id,
			name: customer.name,
			email: customer.email,
			created: iso(customer.created),
			url: api.url(`customers/${customer.id}`),
			card:
				typeof method === "object" && method
					? toCard(method.card)
					: toCard(paid[0]?.payment_method_details?.card),
			spent: {
				amount: paid.reduce(
					(sum, charge) => sum + charge.amount - charge.amount_refunded,
					0,
				),
				currency,
			},
			spentPartial: charges.has_more,
			credit: { amount: -customer.balance, currency },
			delinquent: Boolean(customer.delinquent),
			subscriptions: live.map((subscription) =>
				toSubscription(subscription, products, api),
			),
			charges: charges.data
				.slice(0, CHARGES_SHOWN)
				.map((charge) => toCharge(charge, api)),
		},
		customer,
		subscriptions: subscriptions.data,
		charges: charges.data,
		products,
		currency,
	};
}

/** The charge of the payment that paid an invoice; a failed attempt on the same invoice is not it. */
export function paidCharge(invoice: RawInvoice): string | null {
	const paid = (invoice.payments?.data ?? []).find(
		(entry) => entry.status === "paid",
	)?.payment.payment_intent;
	return typeof paid === "object" && paid ? paid.latest_charge : null;
}

export function accountView(api: StripeApi) {
	return { name: api.account.name, live: api.live, writesOff: api.writesOff };
}

export function customerName(customer: StripeCustomerView | null): string {
	return customer?.name ?? customer?.email ?? "this customer";
}

export function writable(api: StripeApi): true | string {
	return api.writesOff ?? true;
}

const TEST_MAIL_ONLY =
	"This is a test-mode customer. Test emails go only to your own address or an alias of it";

export const BARE_ADDRESS = /^[^\s<>,;"@]+@[^\s<>,;"@]+$/;

/** The address a formatted recipient is sent to, which is its last angle-bracket part; a display name can hold another one. */
export function mailbox(recipient: string): string | null {
	const address = /<([^<>]*)>\s*$/.exec(recipient)?.[1] ?? recipient;
	return BARE_ADDRESS.test(address.trim()) ? address.trim() : null;
}

export function sameMailbox(address: string, own: string): boolean {
	const [local = "", domain = ""] = address.trim().toLowerCase().split("@");
	const [ownLocal = "", ownDomain = ""] = own.trim().toLowerCase().split("@");
	return domain === ownDomain && local.split("+")[0] === ownLocal.split("+")[0];
}

const ONE_ADDRESS = "That is not one email address";

/** Where money cannot move, a customer is test data, so its email may only go to the reader: a real address there is a mistake. */
export async function assertMailable(
	ctx: CardContext,
	api: StripeApi,
	recipients: string[],
): Promise<void> {
	const addresses = recipients.map(mailbox);
	if (addresses.some((address) => address === null))
		throw new CardUnavailable("error", ONE_ADDRESS);
	if (api.live && !api.writesOff) return;
	const reader = await db.query.users.findFirst({
		where: eq(users.id, ctx.readerId),
		columns: { email: true },
	});
	const own = reader?.email ?? "";
	if (!own || addresses.some((address) => !sameMailbox(address ?? "", own)))
		throw new CardUnavailable("error", TEST_MAIL_ONLY);
}
