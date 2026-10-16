import { z } from "zod";
import {
	type CardField,
	defineCard,
	type StripeDisputeView,
	type StripeEvidenceView,
	withInput,
} from "../types";
import { idempotencyKey, type StripeApi, stripeFor } from "./stripeClient";
import {
	accountView,
	type CustomerFacts,
	cardLabel,
	customerName,
	DISPUTE_ID,
	loadCustomer,
	money,
	type RawCharge,
	statusLabel,
	toCharge,
	writable,
} from "./stripeCustomer";

const FIELDS = [
	"product_description",
	"customer_name",
	"customer_email_address",
	"billing_address",
	"service_date",
	"access_activity_log",
	"uncategorized_text",
] as const satisfies readonly (keyof StripeEvidenceView)[];

type Refs = { dispute: string } & Partial<StripeEvidenceView>;

interface RawDispute {
	id: string;
	amount: number;
	currency: string;
	reason: string;
	status: string;
	created: number;
	charge: RawCharge;
	evidence: Partial<Record<keyof StripeEvidenceView, string | null>>;
	evidence_details: {
		due_by: number | null;
		past_due: boolean;
		submission_count: number;
	};
}

interface Data {
	api: StripeApi;
	dispute: RawDispute;
	customer: CustomerFacts | null;
	label: string;
	inquiry: boolean;
	refundable: number;
}

const EVIDENCE_MAX = 8000;
const SHORT_MAX = 300;
const evidence = z.object({
	product_description: z.string().max(EVIDENCE_MAX).optional(),
	customer_name: z.string().max(SHORT_MAX).optional(),
	customer_email_address: z.string().max(SHORT_MAX).optional(),
	billing_address: z.string().max(SHORT_MAX).optional(),
	service_date: z.string().max(SHORT_MAX).optional(),
	access_activity_log: z.string().max(EVIDENCE_MAX).optional(),
	uncategorized_text: z.string().max(EVIDENCE_MAX).optional(),
});

const INQUIRY = "warning_needs_response";
const OPEN = new Set(["needs_response", INQUIRY]);

function disputeStatus(status: string): string {
	return statusLabel(status.replace(/^warning_/, "inquiry_")).replace(
		/^Inquiry needs response$/,
		"Inquiry",
	);
}
const COUNTER_FEE =
	"Countering a dispute has a fee in addition to the dispute fee. You get it back if you win.";
const AUTO_SUBMIT =
	"Stripe submits saved evidence on its own when the deadline comes";

const answerable = (data: Data): true | string =>
	!OPEN.has(data.dispute.status)
		? "This dispute no longer takes a response"
		: data.dispute.evidence_details.past_due
			? "The deadline for evidence has passed"
			: writable(data.api);

const filled = (input: z.infer<typeof evidence>) =>
	Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined),
	);

export const stripeDispute = defineCard<Refs, Data>({
	type: "stripe.dispute",
	label: "Stripe dispute",
	ask: "Answer dispute",
	brand: "stripe",
	refs: evidence.extend({ dispute: z.string().regex(DISPUTE_ID) }),
	async resolve({ refs, ctx }) {
		const api = await stripeFor(ctx);
		const dispute = await api.get<RawDispute>(`disputes/${refs.dispute}`, {
			expand: ["charge"],
		});
		const customer = dispute.charge.customer
			? await loadCustomer(api, dispute.charge.customer)
			: null;
		const drafted = FIELDS.filter(
			(field) => !dispute.evidence[field] && Boolean(refs[field]),
		);
		const charge = toCharge(dispute.charge, api);
		const inquiry = dispute.status === INQUIRY;
		const due = dispute.evidence_details.due_by;
		const view: StripeDisputeView = {
			kind: "stripe.dispute",
			account: accountView(api),
			customer: customer?.view ?? null,
			dispute: {
				id: dispute.id,
				amount: dispute.amount,
				currency: dispute.currency,
				reason: dispute.reason,
				status: dispute.status,
				dueBy: due ? new Date(due * 1000).toISOString() : null,
				pastDue: dispute.evidence_details.past_due,
				submissions: dispute.evidence_details.submission_count,
				created: new Date(dispute.created * 1000).toISOString(),
				url: api.url(`disputes/${dispute.id}`),
				inquiry,
			},
			charge,
			evidence: Object.fromEntries(
				FIELDS.map((field) => [
					field,
					dispute.evidence[field] || refs[field] || "",
				]),
			) as unknown as StripeEvidenceView,
			drafted,
		};
		const who = customerName(customer?.view ?? null);
		const fields: CardField[] = [
			{ label: "Customer", value: who },
			{ label: "Disputed", value: money(dispute.amount, dispute.currency) },
			{ label: "Reason", value: statusLabel(dispute.reason) },
			{ label: "Status", value: disputeStatus(dispute.status) },
			...(view.dispute.dueBy
				? [{ label: "Respond by", value: view.dispute.dueBy.slice(0, 10) }]
				: []),
			{
				label: "Dispute",
				value: dispute.id,
				href: view.dispute.url,
				mono: true,
			},
			...(api.live ? [] : [{ label: "Mode", value: "Test" }]),
		];
		return {
			title: who,
			subtitle: money(dispute.amount, dispute.currency),
			status: inquiry
				? { tone: "warn", text: "Inquiry" }
				: OPEN.has(dispute.status)
					? { tone: "warn", text: "Needs response" }
					: {
							tone: dispute.status === "won" ? "good" : "neutral",
							text: disputeStatus(dispute.status),
						},
			fields,
			view,
			data: {
				api,
				dispute,
				customer,
				label: `${who}'s ${cardLabel(charge.card)} charge`,
				inquiry,
				refundable: dispute.charge.amount - dispute.charge.amount_refunded,
			},
		};
	},
	actions: {
		submit: {
			label: (data) =>
				data.inquiry ? "Respond to inquiry" : "Submit evidence",
			style: "primary",
			role: "primary",
			available: answerable,
			confirm: (data) => {
				const amount = money(data.dispute.amount, data.dispute.currency);
				return data.inquiry
					? `Send this response to the bank for the ${amount} inquiry on ${data.label}? A response can be sent once.`
					: `Submit this evidence to the bank for the ${amount} dispute on ${data.label}? Evidence can be submitted once. ${COUNTER_FEE}`;
			},
			run: withInput(z.object({ evidence }), async ({ data, input }) => {
				await data.api.post(`disputes/${data.dispute.id}`, {
					evidence: filled(input.evidence),
					submit: true,
				});
				const amount = money(data.dispute.amount, data.dispute.currency);
				return {
					outcome: { submitted: true, dispute: data.dispute.id },
					notice: {
						tone: "good",
						text: data.inquiry
							? `Response sent for the ${amount} inquiry`
							: `Evidence submitted for the ${amount} dispute`,
					},
				};
			}),
		},
		save: {
			label: () => "Save draft",
			style: "secondary",
			role: "other",
			terminal: false,
			available: answerable,
			run: withInput(z.object({ evidence }), async ({ data, input }) => {
				await data.api.post(`disputes/${data.dispute.id}`, {
					evidence: filled(input.evidence),
					submit: false,
				});
				return {
					outcome: { saved: true },
					notice: {
						tone: "neutral",
						text: `Draft saved in Stripe. ${AUTO_SUBMIT}`,
					},
				};
			}),
		},
		accept: {
			label: () => "Accept dispute",
			style: "danger",
			role: "other",
			applies: (data) => !data.inquiry,
			available: answerable,
			confirm: (data) =>
				`Accept the ${money(data.dispute.amount, data.dispute.currency)} dispute on ${data.label}? You lose this dispute and the customer is refunded. This closes the dispute and you can no longer submit evidence.`,
			async run({ data }) {
				await data.api.post(`disputes/${data.dispute.id}/close`);
				return {
					outcome: { accepted: true, dispute: data.dispute.id },
					notice: {
						tone: "neutral",
						text: `Accepted the ${money(data.dispute.amount, data.dispute.currency)} dispute`,
					},
				};
			},
		},
		refund: {
			label: () => "Refund customer",
			style: "danger",
			role: "other",
			applies: (data) => data.inquiry,
			available: (data) =>
				data.refundable === 0
					? "This charge has nothing left to refund"
					: answerable(data),
			confirm: (data) =>
				`Refund ${money(data.refundable, data.dispute.currency)} on ${data.label}? A full refund resolves the inquiry. No money has left your account for it yet.`,
			async run({ data, ctx }) {
				const { charge, currency } = data.dispute;
				await data.api.post(
					"refunds",
					{
						charge: charge.id,
						amount: data.refundable,
						metadata: { superset_card: ctx.card?.id ?? "" },
					},
					idempotencyKey(ctx, ["inquiry-refund", charge.id, data.refundable]),
				);
				return {
					outcome: {
						refunded: data.refundable,
						currency,
						dispute: data.dispute.id,
					},
					notice: {
						tone: "good",
						text: `Refunded ${money(data.refundable, currency)} to resolve the inquiry`,
					},
				};
			},
		},
	},
});
