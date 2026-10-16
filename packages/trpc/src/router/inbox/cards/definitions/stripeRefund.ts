import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type StripeEmailView,
	type StripeRefundReason,
	type StripeRefundView,
	withInput,
} from "../types";
import { type Ask, readAsk, replyToAsk } from "./calendarAsk";
import { GMAIL_ID } from "./gmail";
import { idempotencyKey, type StripeApi, stripeFor } from "./stripeClient";
import {
	accountView,
	assertMailable,
	CHARGE_REF,
	type CustomerFacts,
	cardLabel,
	customerName,
	DRAFT_MAX,
	loadCustomer,
	money,
	type RawCharge,
	SUBSCRIPTION_ID,
	toCharge,
	writable,
} from "./stripeCustomer";

interface Refs {
	charge: string;
	amount?: number;
	reason?: StripeRefundReason;
	cancel_subscription?: string;
	gmail_thread?: string;
	reply?: string;
}

interface RawRefund {
	id: string;
	amount: number;
	metadata: Record<string, string> | null;
}

interface Data {
	api: StripeApi;
	charge: RawCharge;
	refundable: number;
	customer: CustomerFacts | null;
	made: RawRefund | null;
	ask: Ask | null;
	label: string;
}

const reason = z.enum([
	"duplicate",
	"fraudulent",
	"requested_by_customer",
	"other",
]);

async function loadCharge(api: StripeApi, ref: string): Promise<RawCharge> {
	if (!ref.startsWith("pi_")) return api.get<RawCharge>(`charges/${ref}`);
	const intent = await api.get<{ latest_charge: RawCharge | null }>(
		`payment_intents/${ref}`,
		{ expand: ["latest_charge"] },
	);
	if (!intent.latest_charge)
		throw new CardUnavailable("gone", "That payment has no charge to refund");
	return intent.latest_charge;
}

const cancellable = (data: Data, id: string) =>
	data.customer?.view.subscriptions.find(
		(subscription) => subscription.id === id,
	);

export const stripeRefund = defineCard<Refs, Data>({
	type: "stripe.refund",
	label: "Stripe refund",
	ask: "Approve refund",
	brand: "stripe",
	refs: z.object({
		charge: z.string().regex(CHARGE_REF),
		/** In the currency's smallest unit; without it, everything left to refund. */
		amount: z.number().int().positive().optional(),
		reason: reason.optional(),
		cancel_subscription: z.string().regex(SUBSCRIPTION_ID).optional(),
		gmail_thread: z.string().regex(GMAIL_ID).optional(),
		reply: z.string().max(DRAFT_MAX).optional(),
	}),
	async resolve({ refs, ctx }) {
		const api = await stripeFor(ctx);
		const charge = await loadCharge(api, refs.charge);
		const [customer, refunds, ask] = await Promise.all([
			charge.customer
				? loadCustomer(api, charge.customer).catch((error) => {
						if (error instanceof CardUnavailable && error.state === "gone")
							return null;
						throw error;
					})
				: null,
			api.get<{ data: RawRefund[] }>("refunds", {
				charge: charge.id,
				limit: 20,
			}),
			refs.gmail_thread
				? readAsk(ctx, { gmail_thread: refs.gmail_thread }).catch((error) => {
						if (error instanceof CardUnavailable) return null;
						throw error;
					})
				: null,
		]);
		const refundable =
			charge.status === "succeeded"
				? charge.amount - charge.amount_refunded
				: 0;
		const view = toCharge(charge, api);
		const email: StripeEmailView | null = ask
			? {
					from: ask.view.from,
					subject: ask.view.subject,
					snippet: ask.view.snippet,
					url: ask.view.url ?? "",
					replyTo: ask.view.replyTo,
					version: ask.view.version,
					draft: refs.reply ?? "",
					canReply: ask.canReply,
					fromCustomer: Boolean(
						customer?.view.email &&
							ask.participants?.has(customer.view.email.toLowerCase()),
					),
				}
			: null;
		const suggested = refs.cancel_subscription;
		const card: StripeRefundView = {
			kind: "stripe.refund",
			account: accountView(api),
			customer: customer?.view ?? null,
			charge: view,
			refundable,
			proposed: {
				amount: Math.min(refs.amount ?? refundable, refundable),
				reason: refs.reason ?? null,
				cancel:
					suggested &&
					customer?.view.subscriptions.some((item) => item.id === suggested)
						? suggested
						: null,
			},
			email,
		};
		const who = customerName(customer?.view ?? null);
		const fields: CardField[] = [
			{ label: "Customer", value: who },
			{ label: "Charged", value: money(charge.amount, charge.currency) },
			{ label: "Card", value: cardLabel(view.card) },
			...(charge.amount_refunded
				? [
						{
							label: "Already refunded",
							value: money(charge.amount_refunded, charge.currency),
						},
					]
				: []),
			{ label: "Charge", value: charge.id, href: view.url, mono: true },
			...(api.live ? [] : [{ label: "Mode", value: "Test" }]),
		];
		return {
			title: who,
			subtitle: money(charge.amount, charge.currency),
			status: refundable === 0 ? { tone: "good", text: "Refunded" } : undefined,
			fields,
			body: charge.description ?? undefined,
			view: card,
			data: {
				api,
				charge,
				refundable,
				customer,
				made:
					(ctx.card &&
						refunds.data.find(
							(refund) => refund.metadata?.superset_card === ctx.card?.id,
						)) ||
					null,
				ask,
				label: `${who} (${cardLabel(view.card)})`,
			},
		};
	},
	actions: {
		refund: {
			label: () => "Refund",
			style: "primary",
			role: "primary",
			available: (data) =>
				data.refundable === 0 && !data.made
					? "This charge has nothing left to refund"
					: writable(data.api),
			run: withInput(
				z.object({
					amount: z.number().int().positive(),
					reason: reason.nullable().optional(),
					cancel: z.string().regex(SUBSCRIPTION_ID).nullable().optional(),
					reply: z
						.object({
							text: z.string().trim().min(1).max(DRAFT_MAX),
							version: z.string().min(1).max(64),
						})
						.nullable()
						.optional(),
				}),
				async ({ refs, data, ctx, input }) => {
					const { api, charge, made } = data;
					if (!made && input.amount > data.refundable)
						throw new CardUnavailable(
							"error",
							`Amount cannot be more than ${money(data.refundable, charge.currency)}.`,
						);
					if (input.cancel && !made && !cancellable(data, input.cancel))
						throw new CardUnavailable(
							"error",
							"That subscription is not one this customer has",
						);
					if (input.reply) {
						if (!data.ask?.canReply)
							throw new CardUnavailable(
								"error",
								"Connect Gmail to send the reply, or refund without it",
							);
						if (input.reply.version !== data.ask.view.version)
							throw new CardUnavailable(
								"error",
								"The email thread has a new message. Read it before you reply",
							);
						await assertMailable(ctx, api, data.ask.view.replyTo);
					}
					const refunded =
						made?.amount ??
						(
							await api.post<RawRefund>(
								"refunds",
								{
									charge: charge.id,
									amount: input.amount,
									...(input.reason && input.reason !== "other"
										? { reason: input.reason }
										: {}),
									metadata: { superset_card: ctx.card?.id ?? "" },
								},
								idempotencyKey(ctx, ["refund", charge.id, input.amount]),
							)
						).amount;
					const paidBack = `Refunded ${money(refunded, charge.currency)} to ${data.label}`;
					if (input.cancel && cancellable(data, input.cancel))
						await api.del(`subscriptions/${input.cancel}`).catch((error) => {
							throw new CardUnavailable(
								"error",
								`${paidBack}. The subscription was not canceled: ${error instanceof CardUnavailable ? error.text : "Stripe did not answer"}. Try again to finish`,
							);
						});
					const replied = input.reply
						? await replyToAsk(
								ctx,
								{ gmail_thread: refs.gmail_thread },
								input.reply.version,
								input.reply.text,
							).then(
								() => true,
								() => false,
							)
						: null;
					const done = `${paidBack}${input.cancel ? " and canceled the subscription" : ""}`;
					return {
						outcome: {
							refunded,
							currency: charge.currency,
							charge: charge.id,
							canceled: input.cancel ?? null,
							replied,
						},
						notice:
							replied === false
								? {
										tone: "warn",
										text: `${done}. The email reply was not sent`,
									}
								: { tone: "good", text: done },
					};
				},
			),
		},
		dismiss: {
			label: () => "Do not refund",
			style: "secondary",
			role: "dismiss",
			async run({ data }) {
				return { outcome: { refunded: data.made?.amount ?? 0 } };
			},
		},
	},
});
