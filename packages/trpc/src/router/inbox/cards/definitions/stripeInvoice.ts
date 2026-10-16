import { z } from "zod";
import {
	type CardField,
	defineCard,
	type StripeInvoiceActionView,
} from "../types";
import { idempotencyKey, type StripeApi, stripeFor } from "./stripeClient";
import {
	accountView,
	type CustomerFacts,
	customerName,
	INVOICE_ID,
	loadCustomer,
	money,
	type RawInvoice,
	statusLabel,
	toInvoice,
	writable,
} from "./stripeCustomer";

interface Data {
	api: StripeApi;
	invoice: RawInvoice;
	customer: CustomerFacts;
	name: string;
	amount: string;
	to: string | null;
}

const UNPAID = new Set(["open", "uncollectible"]);

const whenUnpaid = (data: Data): true | string =>
	UNPAID.has(data.invoice.status ?? "")
		? writable(data.api)
		: data.invoice.status === "draft"
			? "Send the invoice first"
			: `This invoice is already ${data.invoice.status}`;

export const stripeInvoice = defineCard<{ invoice: string }, Data>({
	type: "stripe.invoice",
	label: "Stripe invoice",
	ask: "Handle invoice",
	brand: "stripe",
	refs: z.object({ invoice: z.string().regex(INVOICE_ID) }),
	async resolve({ refs, ctx }) {
		const api = await stripeFor(ctx);
		const invoice = await api.get<RawInvoice>(`invoices/${refs.invoice}`, {
			expand: ["payments.data.payment.payment_intent"],
		});
		const customer = await loadCustomer(api, invoice.customer);
		const shown = toInvoice(invoice, api);
		const to =
			invoice.status === "draft"
				? (customer.view.email ?? invoice.customer_email)
				: (invoice.customer_email ?? customer.view.email);
		const view: StripeInvoiceActionView = {
			kind: "stripe.invoice",
			account: accountView(api),
			customer: customer.view,
			invoice: shown,
			to,
		};
		const who = customerName(customer.view);
		const amount = money(
			invoice.status === "draft" ? invoice.total : invoice.amount_due,
			invoice.currency,
		);
		const fields: CardField[] = [
			{ label: "Customer", value: who },
			{ label: "Amount", value: amount },
			{ label: "Status", value: statusLabel(shown.status) },
			...(shown.dueDate
				? [{ label: "Due", value: shown.dueDate.slice(0, 10) }]
				: []),
			{
				label: "Invoice",
				value: invoice.number ?? invoice.id,
				href: shown.url,
			},
			...(api.live ? [] : [{ label: "Mode", value: "Test" }]),
		];
		return {
			title: who,
			subtitle: amount,
			status:
				invoice.status === "paid"
					? { tone: "good", text: "Paid" }
					: invoice.status === "void"
						? { tone: "neutral", text: "Void" }
						: undefined,
			fields,
			body: shown.lines.map((line) => line.description).join("\n") || undefined,
			view,
			data: {
				api,
				invoice,
				customer,
				name: invoice.number ?? "this draft invoice",
				amount,
				to,
			},
		};
	},
	actions: {
		send: {
			label: (data) =>
				data.invoice.status === "draft" ? "Send invoice" : "Send again",
			style: "primary",
			role: "primary",
			available: (data) =>
				data.invoice.status !== "draft" && data.invoice.status !== "open"
					? `This invoice is already ${data.invoice.status}`
					: data.invoice.collection_method !== "send_invoice"
						? "Stripe charges this invoice automatically, so it is not sent for payment"
						: !data.to
							? "This customer has no email address to send to"
							: writable(data.api),
			confirm: (data) =>
				`Send ${data.name} for ${data.amount} to ${customerName(data.customer.view)} at ${data.to}?`,
			async run({ data, ctx }) {
				const { api, invoice } = data;
				if (invoice.status === "draft")
					await api.post(
						`invoices/${invoice.id}/finalize`,
						{},
						idempotencyKey(ctx, ["finalize", invoice.id]),
					);
				await api.post(`invoices/${invoice.id}/send`);
				return {
					outcome: { sent: true, invoice: invoice.id },
					notice: {
						tone: "good",
						text: api.live
							? `Sent the invoice for ${data.amount} to ${data.to}`
							: `Sent the invoice for ${data.amount}. Stripe emails no customer in test mode`,
					},
				};
			},
		},
		mark_paid: {
			label: () => "Mark as paid",
			style: "secondary",
			role: "other",
			applies: (data) => data.invoice.status !== "draft",
			available: whenUnpaid,
			confirm: (data) =>
				`Mark ${data.name} for ${data.amount} as paid outside Stripe? No card is charged and ${customerName(data.customer.view)} owes nothing more on it.`,
			async run({ data, ctx }) {
				await data.api.post(
					`invoices/${data.invoice.id}/pay`,
					{ paid_out_of_band: true },
					idempotencyKey(ctx, ["paid-out-of-band", data.invoice.id]),
				);
				return {
					outcome: { paid: "out_of_band", invoice: data.invoice.id },
					notice: {
						tone: "good",
						text: `Marked the invoice for ${data.amount} as paid`,
					},
				};
			},
		},
		void: {
			label: () => "Void invoice",
			style: "danger",
			role: "other",
			applies: (data) => data.invoice.status !== "draft",
			available: whenUnpaid,
			confirm: (data) =>
				`Void ${data.name} for ${data.amount}? ${customerName(data.customer.view)} can no longer pay it, and this cannot be undone.`,
			async run({ data }) {
				await data.api.post(`invoices/${data.invoice.id}/void`);
				return {
					outcome: { voided: true, invoice: data.invoice.id },
					notice: {
						tone: "neutral",
						text: `Voided the invoice for ${data.amount}`,
					},
				};
			},
		},
		mark_uncollectible: {
			label: () => "Mark uncollectible",
			style: "secondary",
			role: "other",
			applies: (data) => data.invoice.status === "open",
			available: (data) => writable(data.api),
			confirm: (data) =>
				`Mark ${data.name} for ${data.amount} as uncollectible? It is no longer open, and after this it can only be marked paid or void.`,
			async run({ data }) {
				await data.api.post(`invoices/${data.invoice.id}/mark_uncollectible`);
				return {
					outcome: { uncollectible: true, invoice: data.invoice.id },
					notice: {
						tone: "neutral",
						text: `Marked the invoice for ${data.amount} as uncollectible`,
					},
				};
			},
		},
		dismiss: {
			label: () => "Leave it",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { changed: false } };
			},
		},
	},
});
