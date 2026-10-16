import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type StripeFailedPaymentView,
	withInput,
} from "../types";
import { canMailNote, mailNote } from "./calendarMail";
import { idempotencyKey, type StripeApi, stripeFor } from "./stripeClient";
import {
	accountView,
	assertMailable,
	BARE_ADDRESS,
	type CustomerFacts,
	cardLabel,
	customerName,
	DRAFT_MAX,
	INVOICE_ID,
	loadCustomer,
	money,
	type RawInvoice,
	type RawPaymentMethod,
	toCard,
	toInvoice,
	writable,
} from "./stripeCustomer";

interface Refs {
	invoice: string;
	subject?: string;
	email?: string;
}

interface Data {
	api: StripeApi;
	invoice: RawInvoice;
	customer: CustomerFacts;
	canSend: boolean;
	method: RawPaymentMethod | null;
	to: string | null;
	who: string;
}

/** Stripe charges the invoice's own payment method, then the subscription's, then the customer's default. */
function chargedMethod(
	invoice: RawInvoice,
	customer: CustomerFacts,
): RawPaymentMethod | null {
	const subscription = invoice.parent?.subscription_details?.subscription;
	const candidates = [
		invoice.default_payment_method,
		typeof subscription === "object"
			? subscription?.default_payment_method
			: null,
		customer.customer.invoice_settings?.default_payment_method,
	];
	const method = candidates.find((candidate) => Boolean(candidate));
	return typeof method === "object" && method ? method : null;
}

const charging = (data: Data) =>
	`${money(data.invoice.amount_remaining, data.invoice.currency)} to ${data.who}'s ${cardLabel(toCard(data.method?.card))}`;

const SUBJECT_MAX = 200;

/** A failed attempt leaves a new charge on the payment intent, so this changes with every try; Stripe's own attempt count does not move on a manual one. */
function paymentAttempt(invoice: RawInvoice): string | null {
	const intent = invoice.payments?.data.at(-1)?.payment.payment_intent;
	return typeof intent === "object" && intent ? intent.latest_charge : null;
}

const unpaid = (data: Data): true | string =>
	data.invoice.status === "open"
		? writable(data.api)
		: data.invoice.status === "paid"
			? "This invoice is already paid"
			: "This invoice is no longer open";

export const stripeFailedPayment = defineCard<Refs, Data>({
	type: "stripe.failed_payment",
	label: "Stripe failed payment",
	ask: "Recover payment",
	brand: "stripe",
	refs: z.object({
		invoice: z.string().regex(INVOICE_ID),
		subject: z.string().trim().min(1).max(SUBJECT_MAX).optional(),
		email: z.string().max(DRAFT_MAX).optional(),
	}),
	async resolve({ refs, ctx }) {
		const api = await stripeFor(ctx);
		const invoice = await api.get<RawInvoice>(`invoices/${refs.invoice}`, {
			expand: [
				"payments.data.payment.payment_intent",
				"default_payment_method",
				"parent.subscription_details.subscription.default_payment_method",
			],
		});
		const [customer, canSend] = await Promise.all([
			loadCustomer(api, invoice.customer),
			canMailNote(ctx),
		]);
		const shown = toInvoice(invoice, api);
		const to = customer.view.email ?? invoice.customer_email;
		const method = chargedMethod(invoice, customer);
		const due = money(invoice.amount_remaining, invoice.currency);
		const view: StripeFailedPaymentView = {
			kind: "stripe.failed_payment",
			account: accountView(api),
			customer: customer.view,
			invoice: shown,
			charged: toCard(method?.card),
			email: {
				to,
				subject: refs.subject ?? `Your payment of ${due} did not go through`,
				draft: refs.email ?? "",
				canSend: canSend && Boolean(to) && Boolean(invoice.hosted_invoice_url),
			},
		};
		const who = customerName(customer.view);
		const fields: CardField[] = [
			{ label: "Customer", value: who },
			{ label: "Amount due", value: due },
			{ label: "Card", value: cardLabel(view.charged) },
			...(shown.lastError
				? [{ label: "Declined", value: shown.lastError }]
				: []),
			{ label: "Attempts", value: String(invoice.attempt_count) },
			{
				label: "Invoice",
				value: invoice.number ?? invoice.id,
				href: shown.url,
			},
			...(api.live ? [] : [{ label: "Mode", value: "Test" }]),
		];
		return {
			title: who,
			subtitle: due,
			status:
				invoice.status === "paid" ? { tone: "good", text: "Paid" } : undefined,
			fields,
			view,
			data: {
				api,
				invoice,
				customer,
				canSend: view.email.canSend,
				method,
				to,
				who,
			},
		};
	},
	actions: {
		retry: {
			label: () => "Charge customer",
			style: "primary",
			role: "primary",
			available: unpaid,
			confirm: (data) => `Charge ${charging(data)} now?`,
			async run({ data, ctx }) {
				const { api, invoice } = data;
				const paid = await api.post<RawInvoice>(
					`invoices/${invoice.id}/pay`,
					{},
					idempotencyKey(ctx, [
						"pay",
						invoice.id,
						paymentAttempt(invoice),
						data.method?.id,
					]),
				);
				if (paid.status !== "paid")
					throw new CardUnavailable(
						"error",
						"Stripe took the request but the invoice is not paid yet. Look again in a minute",
					);
				return {
					outcome: {
						paid: true,
						amount: invoice.amount_remaining,
						currency: invoice.currency,
					},
					notice: { tone: "good", text: `Charged ${charging(data)}` },
				};
			},
		},
		send_link: {
			label: () => "Send update-card link",
			style: "secondary",
			role: "other",
			available: (data) =>
				data.invoice.status !== "open"
					? unpaid(data)
					: data.canSend
						? true
						: "Connect Gmail to email the customer",
			run: withInput(
				z.object({
					subject: z.string().trim().min(1).max(SUBJECT_MAX),
					text: z.string().trim().min(1).max(DRAFT_MAX),
				}),
				async ({ data, ctx, input }) => {
					const { to } = data;
					const link = data.invoice.hosted_invoice_url;
					if (!to || !link)
						throw new CardUnavailable(
							"error",
							"This customer has no email address or payment page",
						);
					if (!BARE_ADDRESS.test(to))
						throw new CardUnavailable(
							"error",
							"The customer's email in Stripe is not one email address",
						);
					await assertMailable(ctx, data.api, [to]);
					const text = input.text.includes(link)
						? input.text
						: `${input.text}\n\n${link}`;
					const sent = await mailNote(ctx, {
						to: [to],
						subject: input.subject,
						text,
					});
					if (!sent)
						throw new CardUnavailable(
							"error",
							"The email could not be sent. Connect Gmail and try again",
						);
					return {
						outcome: { emailed: to, invoice: data.invoice.id },
						notice: { tone: "good", text: `Sent the payment link to ${to}` },
					};
				},
			),
		},
		dismiss: {
			label: () => "Leave it",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { paid: false } };
			},
		},
	},
});
