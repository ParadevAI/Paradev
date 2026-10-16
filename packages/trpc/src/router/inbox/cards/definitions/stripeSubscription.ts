import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type StripeSubscriptionChangeView,
	withInput,
} from "../types";
import { idempotencyKey, type StripeApi, stripeFor } from "./stripeClient";
import {
	accountView,
	type CustomerFacts,
	cardLabel,
	customerName,
	loadCustomer,
	money,
	paidCharge,
	priceLabel,
	type RawCharge,
	type RawInvoice,
	type RawSubscription,
	SUBSCRIPTION_ID,
	statusLabel,
	toCard,
	toSubscription,
	writable,
} from "./stripeCustomer";

interface Refs {
	subscription: string;
	change: "cancel" | "pause";
	when?: "now" | "period_end";
	refund?: "none" | "prorated" | "last_payment";
	resumes_at?: string;
}

interface Data {
	api: StripeApi;
	subscription: RawSubscription;
	customer: CustomerFacts;
	lastCharge: RawCharge | null;
	refunded: { amount: number } | null;
	currency: string;
	label: string;
	plan: string;
	change: "cancel" | "pause";
}

const refund = z.enum(["none", "prorated", "last_payment"]);
const PAUSE_DAYS_MAX = 366;
const PREVIEW_AGE_MAX_S = 15 * 60;
const CLOCK_SKEW_S = 60;
const CHANGED = "The refund amount changed. Read it again before you cancel";
const DAY_MS = 24 * 60 * 60 * 1000;

const open = (data: Data): true | string =>
	data.subscription.status === "canceled"
		? "This subscription is already canceled"
		: writable(data.api);

async function lastCharge(
	api: StripeApi,
	subscription: RawSubscription,
): Promise<RawCharge | null> {
	if (!subscription.latest_invoice) return null;
	const invoice = await api.get<RawInvoice>(
		`invoices/${subscription.latest_invoice}`,
		{ expand: ["payments.data.payment.payment_intent"] },
	);
	const charge = paidCharge(invoice);
	return charge ? api.get<RawCharge>(`charges/${charge}`) : null;
}

/** Stripe prorates by the second and takes no date for a cancel preview, so the amount the reader confirmed is refunded when it is the current one plus only what those seconds are worth. The current amount carries tax, discounts and tiers; a price list does not. */
function drift(
	subscription: RawSubscription,
	current: number,
	now: number,
	seconds: number,
): number {
	const left = (subscription.items.data[0]?.current_period_end ?? 0) - now;
	return left > 0 ? Math.ceil((current * (seconds + 5)) / left) : 0;
}

async function unusedTime(
	api: StripeApi,
	subscription: RawSubscription,
): Promise<number> {
	if (subscription.status !== "active") return 0;
	const preview = await api
		.post<{ total: number }>("invoices/create_preview", {
			customer: subscription.customer,
			subscription: subscription.id,
			subscription_details: {
				cancel_now: true,
				proration_behavior: "create_prorations",
			},
		})
		.catch((error) => {
			if (error instanceof CardUnavailable) return { total: 0 };
			throw error;
		});
	return Math.max(0, -preview.total);
}

export const stripeSubscription = defineCard<Refs, Data>({
	type: "stripe.subscription",
	label: "Stripe subscription",
	ask: "Change subscription",
	brand: "stripe",
	refs: z.object({
		subscription: z.string().regex(SUBSCRIPTION_ID),
		change: z.enum(["cancel", "pause"]),
		when: z.enum(["now", "period_end"]).optional(),
		refund: refund.optional(),
		resumes_at: z.string().datetime({ offset: true }).optional(),
	}),
	async resolve({ refs, ctx }) {
		const api = await stripeFor(ctx);
		const subscription = await api.get<RawSubscription>(
			`subscriptions/${refs.subscription}`,
			{ expand: ["items.data.price"] },
		);
		const prorationDate = Math.floor(Date.now() / 1000);
		const [customer, charge, unused] = await Promise.all([
			loadCustomer(api, subscription.customer),
			lastCharge(api, subscription),
			unusedTime(api, subscription),
		]);
		const cardId = ctx.card?.id ?? "";
		const refunds = charge
			? await api.get<{
					data: { amount: number; metadata: Record<string, string> | null }[];
				}>("refunds", { charge: charge.id, limit: 20 })
			: { data: [] };
		const left = charge ? charge.amount - charge.amount_refunded : 0;
		const prorated = Math.min(unused, left);
		const shown = toSubscription(subscription, customer.products, api);
		const currency = shown.price.currency;
		const view: StripeSubscriptionChangeView = {
			kind: "stripe.subscription",
			account: accountView(api),
			customer: customer.view,
			subscription: shown,
			change: refs.change,
			proposed: {
				when: refs.when ?? "now",
				refund: refs.when === "period_end" ? "none" : (refs.refund ?? "none"),
				resumesAt: refs.resumes_at
					? new Date(refs.resumes_at).toISOString()
					: null,
				behavior: "keep_as_draft",
			},
			preview: {
				prorationDate,
				prorated: { amount: prorated, currency },
				lastPayment:
					charge && left > 0
						? {
								amount: left,
								currency: charge.currency,
								charge: charge.id,
								card: toCard(charge.payment_method_details?.card),
							}
						: null,
			},
		};
		const who = customerName(customer.view);
		const fields: CardField[] = [
			{ label: "Customer", value: who },
			{ label: "Plan", value: shown.product },
			{
				label: "Price",
				value: priceLabel(shown),
			},
			{ label: "Status", value: statusLabel(subscription.status) },
			{
				label: "Subscription",
				value: subscription.id,
				href: shown.url,
				mono: true,
			},
			...(api.live ? [] : [{ label: "Mode", value: "Test" }]),
		];
		return {
			title: who,
			subtitle: shown.product,
			fields,
			view,
			data: {
				api,
				subscription,
				customer,
				lastCharge: charge,
				refunded: cardId
					? (refunds.data.find(
							(item) => item.metadata?.superset_card === cardId,
						) ?? null)
					: null,
				currency,
				label: `${who} (${cardLabel(toCard(charge?.payment_method_details?.card))})`,
				plan: shown.product,
				change: refs.change,
			},
		};
	},
	actions: {
		cancel: {
			label: () => "Cancel subscription",
			style: "danger",
			role: "other",
			applies: (data) => data.subscription.status !== "canceled",
			available: open,
			run: withInput(
				z.object({
					when: z.enum(["now", "period_end"]),
					refund: refund.default("none"),
					prorationDate: z.number().int().positive().optional(),
					prorated: z.number().int().min(0).optional(),
					charge: z.string().max(100).optional(),
					amount: z.number().int().min(0).optional(),
				}),
				async ({ data, ctx, input }) => {
					const { api, subscription } = data;
					if (input.when === "period_end") {
						if (input.refund !== "none")
							throw new CardUnavailable(
								"error",
								"A refund goes with cancelling now, not at the end of the period",
							);
						await api.post(`subscriptions/${subscription.id}`, {
							cancel_at_period_end: true,
						});
						return {
							outcome: { canceled: "period_end", refunded: 0 },
							notice: {
								tone: "good",
								text: `${data.plan} for ${customerName(data.customer.view)} will cancel at the end of the period`,
							},
						};
					}
					const charge = data.lastCharge;
					const left = charge ? charge.amount - charge.amount_refunded : 0;
					let amount = 0;
					if (input.refund !== "none" && !data.refunded) {
						if (!charge || left === 0)
							throw new CardUnavailable(
								"error",
								"There is no payment left to refund on this subscription",
							);
						if (input.refund === "prorated") {
							const at = input.prorationDate ?? 0;
							const now = Math.floor(Date.now() / 1000);
							if (at > now + CLOCK_SKEW_S || at < now - PREVIEW_AGE_MAX_S)
								throw new CardUnavailable("error", CHANGED);
							const current = Math.min(
								await unusedTime(api, subscription),
								left,
							);
							const seen = input.prorated ?? -1;
							if (
								seen < current ||
								seen > left ||
								seen - current > drift(subscription, current, now, now - at)
							)
								throw new CardUnavailable("error", CHANGED);
							amount = seen;
						} else {
							if (input.charge !== charge.id || input.amount !== left)
								throw new CardUnavailable("error", CHANGED);
							amount = left;
						}
						if (amount > 0)
							await api.post(
								"refunds",
								{
									charge: charge.id,
									amount,
									reason: "requested_by_customer",
									metadata: { superset_card: ctx.card?.id ?? "" },
								},
								idempotencyKey(ctx, ["cancel-refund", charge.id, amount]),
							);
					}
					const refunded = data.refunded?.amount ?? amount;
					await api
						.del(`subscriptions/${subscription.id}`, {
							prorate: false,
							invoice_now: false,
						})
						.catch((error) => {
							if (!refunded) throw error;
							throw new CardUnavailable(
								"error",
								`Refunded ${money(refunded, data.currency)} to ${data.label}. The subscription was not canceled: ${error instanceof CardUnavailable ? error.text : "Stripe did not answer"}. Try again to finish`,
							);
						});
					return {
						outcome: { canceled: "now", refunded, currency: data.currency },
						notice: {
							tone: "good",
							text: refunded
								? `Canceled ${data.plan} and refunded ${money(refunded, data.currency)} to ${data.label}`
								: `Canceled ${data.plan} for ${customerName(data.customer.view)}`,
						},
					};
				},
			),
		},
		pause: {
			label: () => "Pause payment collection",
			style: "primary",
			role: "primary",
			applies: (data) =>
				data.subscription.status !== "canceled" &&
				!data.subscription.pause_collection,
			available: open,
			run: withInput(
				z.object({
					resumesAt: z
						.string()
						.datetime({ offset: true })
						.nullable()
						.optional(),
					behavior: z
						.enum(["keep_as_draft", "mark_uncollectible", "void"])
						.default("keep_as_draft"),
				}),
				async ({ data, input }) => {
					const until = input.resumesAt ? Date.parse(input.resumesAt) : null;
					if (until !== null && until <= Date.now())
						throw new CardUnavailable("error", "That time has passed");
					if (until !== null && until > Date.now() + PAUSE_DAYS_MAX * DAY_MS)
						throw new CardUnavailable("error", "Pause for a year at most");
					await data.api.post(`subscriptions/${data.subscription.id}`, {
						pause_collection: {
							behavior: input.behavior,
							...(until === null
								? {}
								: { resumes_at: Math.floor(until / 1000) }),
						},
					});
					return {
						outcome: {
							paused: true,
							resumesAt: until === null ? null : new Date(until).toISOString(),
						},
						notice: {
							tone: "good",
							text: `Paused payment collection on ${data.plan} for ${customerName(data.customer.view)}`,
						},
					};
				},
			),
		},
		resume: {
			label: () => "Resume payment collection",
			style: "primary",
			role: "primary",
			applies: (data) => Boolean(data.subscription.pause_collection),
			available: open,
			async run({ data }) {
				await data.api.post(`subscriptions/${data.subscription.id}`, {
					pause_collection: "",
				});
				return {
					outcome: { paused: false },
					notice: {
						tone: "good",
						text: `Resumed payment collection on ${data.plan}`,
					},
				};
			},
		},
		dismiss: {
			label: (data) =>
				data.subscription.status === "canceled"
					? "Done"
					: data.change === "cancel"
						? "Don't cancel"
						: "Keep subscription",
			style: "secondary",
			role: "dismiss",
			async run({ data }) {
				return {
					outcome: {
						canceled: data.subscription.status === "canceled",
						refunded: data.refunded?.amount ?? 0,
					},
				};
			},
		},
	},
});
