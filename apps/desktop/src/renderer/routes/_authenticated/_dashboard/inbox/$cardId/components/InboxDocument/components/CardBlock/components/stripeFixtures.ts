import type {
	CardAction,
	StripeAccountView,
	StripeAdjustView,
	StripeCardView,
	StripeChargeView,
	StripeCouponView,
	StripeCustomerView,
	StripeDisputeView,
	StripeFailedPaymentView,
	StripeInvoiceActionView,
	StripeInvoiceView,
	StripeRefundView,
	StripeSubscriptionChangeView,
	StripeSubscriptionView,
} from "../types";

/** A made-up Stripe sandbox of "Lumen Labs". Every customer is invented and every date is in the autumn of 2037. */

const dashboard = (path: string) => `https://dashboard.stripe.com/test/${path}`;

export const account: StripeAccountView = {
	name: "Lumen Labs",
	live: false,
	writesOff: null,
};
export const liveAccount: StripeAccountView = { ...account, live: true };
export const WRITES_OFF =
	"This is a live Stripe account. Writes from this environment are off";
export const lockedAccount: StripeAccountView = {
	...liveAccount,
	writesOff: WRITES_OFF,
};

export const visa: StripeCardView = { brand: "visa", last4: "4242" };
const mastercard: StripeCardView = { brand: "mastercard", last4: "4444" };

function charge(
	n: number,
	amount: number,
	created: string,
	extra: Partial<StripeChargeView> = {},
): StripeChargeView {
	const id = `ch_3Fixture${String(n).padStart(14, "0")}`;
	return {
		id,
		amount,
		refunded: 0,
		currency: "usd",
		status: "succeeded",
		created,
		description: null,
		card: visa,
		disputed: false,
		url: dashboard(`payments/${id}`),
		...extra,
	};
}

function subscription(
	n: number,
	product: string,
	amount: number,
	extra: Partial<StripeSubscriptionView> = {},
): StripeSubscriptionView {
	const id = `sub_1Fixture${String(n).padStart(12, "0")}`;
	return {
		id,
		status: "active",
		product,
		price: { amount, currency: "usd", interval: "month", intervalCount: 1 },
		quantity: 1,
		items: 1,
		metered: false,
		currentPeriodStart: "2037-10-03T12:00:00.000Z",
		currentPeriodEnd: "2037-11-03T12:00:00.000Z",
		cancelAtPeriodEnd: false,
		cancelAt: null,
		trialEnd: null,
		paused: null,
		discounts: [],
		url: dashboard(`subscriptions/${id}`),
		...extra,
	};
}

export const packageCharge = charge(1, 4900, "2037-10-03T12:00:00.000Z", {
	description: "Onboarding package",
});
export const partlyRefundedCharge: StripeChargeView = {
	...packageCharge,
	refunded: 1000,
};
const proCharge = charge(2, 2000, "2037-10-03T12:00:00.000Z", {
	description: "Subscription update",
});

export const pro = subscription(1, "Pro", 2000);
export const teamAddOn = subscription(2, "Team add-on", 50000, {
	price: { amount: 50000, currency: "usd", interval: "year", intervalCount: 1 },
	quantity: 2,
});
export const pausedPro: StripeSubscriptionView = {
	...pro,
	paused: { resumesAt: "2037-12-01T12:00:00.000Z" },
};

export const avery: StripeCustomerView = {
	id: "cus_FixtureAvery01",
	name: "Avery Chen",
	email: "avery@example.com",
	created: "2037-06-03T12:00:00.000Z",
	url: dashboard("customers/cus_FixtureAvery01"),
	card: visa,
	spent: { amount: 6900, currency: "usd" },
	spentPartial: false,
	credit: { amount: 0, currency: "usd" },
	delinquent: false,
	subscriptions: [pro],
	charges: [
		packageCharge,
		proCharge,
		charge(3, 2000, "2037-09-03T12:00:00.000Z", { refunded: 2000 }),
		charge(4, 2000, "2037-08-20T12:00:00.000Z", {
			status: "failed",
			card: mastercard,
		}),
		charge(5, 2000, "2037-08-03T12:00:00.000Z", {
			refunded: 2000,
			disputed: true,
		}),
	],
};

export const averyTwoPlans: StripeCustomerView = {
	...avery,
	credit: { amount: 1000, currency: "usd" },
	subscriptions: [pro, teamAddOn],
};

const trialPro = subscription(3, "Pro", 2000, {
	status: "trialing",
	trialEnd: "2037-10-17T12:00:00.000Z",
	currentPeriodEnd: "2037-10-17T12:00:00.000Z",
});

export const blake: StripeCustomerView = {
	id: "cus_FixtureBlake01",
	name: "Blake Rivera",
	email: "blake@example.com",
	created: "2037-10-03T12:00:00.000Z",
	url: dashboard("customers/cus_FixtureBlake01"),
	card: null,
	spent: { amount: 0, currency: "usd" },
	spentPartial: false,
	credit: { amount: 0, currency: "usd" },
	delinquent: false,
	subscriptions: [trialPro],
	charges: [],
};

export const devon: StripeCustomerView = {
	id: "cus_FixtureDevon01",
	name: "Devon Park",
	email: "devon@example.com",
	created: "2037-05-03T12:00:00.000Z",
	url: dashboard("customers/cus_FixtureDevon01"),
	card: mastercard,
	spent: { amount: 8000, currency: "usd" },
	spentPartial: true,
	credit: { amount: 0, currency: "usd" },
	delinquent: true,
	subscriptions: [subscription(4, "Pro", 2000, { status: "past_due" })],
	charges: [
		charge(6, 2000, "2037-10-03T12:00:00.000Z", {
			status: "failed",
			card: mastercard,
		}),
		charge(7, 2000, "2037-09-03T12:00:00.000Z", { card: mastercard }),
	],
};

const jcb: StripeCardView = { brand: "jcb", last4: "0505" };
const yenCharge = charge(8, 4900, "2037-10-03T12:00:00.000Z", {
	currency: "jpy",
	description: "Pro",
	card: jcb,
});

export const kenji: StripeCustomerView = {
	id: "cus_FixtureKenji01",
	name: "Kenji Sato",
	email: "kenji@example.com",
	created: "2037-07-03T12:00:00.000Z",
	url: dashboard("customers/cus_FixtureKenji01"),
	card: jcb,
	spent: { amount: 9800, currency: "jpy" },
	spentPartial: false,
	credit: { amount: 0, currency: "jpy" },
	delinquent: false,
	subscriptions: [
		subscription(5, "Pro", 4900, {
			price: {
				amount: 4900,
				currency: "jpy",
				interval: "month",
				intervalCount: 1,
			},
		}),
	],
	charges: [yenCharge, { ...yenCharge, id: "ch_3Fixture00000000000009" }],
};

const input = "JSON";

export const refundActions: CardAction[] = [
	{ id: "refund", label: "Refund", style: "primary", role: "primary", input },
	{
		id: "dismiss",
		label: "Do not refund",
		style: "secondary",
		role: "dismiss",
	},
];

export const refundView: StripeRefundView = {
	kind: "stripe.refund",
	account,
	customer: avery,
	charge: packageCharge,
	refundable: 4900,
	proposed: { amount: 2500, reason: "requested_by_customer", cancel: null },
	email: {
		from: "Avery Chen <avery@example.com>",
		subject: "Refund for the onboarding package",
		snippet:
			"Hi, we only used half of the onboarding sessions before the team changed plans. Could you refund the part we did not use?",
		url: "https://mail.google.com/mail/?authuser=riya%40lumenlabs.io#all/1a0fb9dc85867470",
		replyTo: ["avery@example.com"],
		version: "19a0fb9dc8586747",
		draft:
			"Hi Avery,\n\nI refunded $25.00 for the sessions you did not use. It reaches your card in 5 to 10 days.\n\nRiya",
		canReply: true,
		fromCustomer: true,
	},
};

export const refundNoEmailView: StripeRefundView = {
	...refundView,
	email: null,
};

export const partRefundView: StripeRefundView = {
	...refundNoEmailView,
	charge: partlyRefundedCharge,
	refundable: 3900,
	proposed: { amount: 3900, reason: null, cancel: null },
};

export const guestRefundView: StripeRefundView = {
	...refundNoEmailView,
	customer: null,
	proposed: { amount: 4900, reason: "duplicate", cancel: null },
};

export const yenRefundView: StripeRefundView = {
	...refundNoEmailView,
	customer: kenji,
	charge: yenCharge,
	refundable: 4900,
	proposed: { amount: 4900, reason: null, cancel: null },
};

export const subscriptionActions: CardAction[] = [
	{
		id: "cancel",
		label: "Cancel subscription",
		style: "danger",
		role: "other",
		input,
	},
	{
		id: "pause",
		label: "Pause payment collection",
		style: "primary",
		role: "primary",
		input,
	},
	{ id: "dismiss", label: "Don't cancel", style: "secondary", role: "dismiss" },
];

export const pauseActions: CardAction[] = subscriptionActions.map((action) =>
	action.id === "dismiss" ? { ...action, label: "Keep subscription" } : action,
);

export const pausedActions: CardAction[] = [
	{
		id: "cancel",
		label: "Cancel subscription",
		style: "danger",
		role: "other",
		input,
	},
	{
		id: "resume",
		label: "Resume payment collection",
		style: "primary",
		role: "primary",
	},
	{ id: "dismiss", label: "Don't cancel", style: "secondary", role: "dismiss" },
];

export const cancelView: StripeSubscriptionChangeView = {
	kind: "stripe.subscription",
	account,
	customer: avery,
	subscription: pro,
	change: "cancel",
	proposed: {
		when: "now",
		refund: "prorated",
		resumesAt: null,
		behavior: "keep_as_draft",
	},
	preview: {
		prorationDate: 2_138_122_800,
		prorated: { amount: 1342, currency: "usd" },
		lastPayment: {
			amount: 2000,
			currency: "usd",
			charge: proCharge.id,
			card: visa,
		},
	},
};

export const pauseView: StripeSubscriptionChangeView = {
	...cancelView,
	change: "pause",
	proposed: {
		when: "now",
		refund: "none",
		resumesAt: "2037-11-03T12:00:00.000Z",
		behavior: "keep_as_draft",
	},
};

export const pauseDefaultsView: StripeSubscriptionChangeView = {
	...pauseView,
	proposed: { ...pauseView.proposed, resumesAt: null },
};

export const cancelAtPeriodEndView: StripeSubscriptionChangeView = {
	...cancelView,
	proposed: { ...cancelView.proposed, when: "period_end", refund: "none" },
};

export const pausedView: StripeSubscriptionChangeView = {
	...cancelView,
	customer: { ...avery, subscriptions: [pausedPro] },
	subscription: pausedPro,
	proposed: { ...cancelView.proposed, when: "period_end", refund: "none" },
};

export const coupons: StripeCouponView[] = [
	{
		id: "WINBACK25",
		name: "Win-back",
		percentOff: 25,
		amountOff: null,
		duration: "repeating",
		months: 3,
	},
	{
		id: "FIVEOFF",
		name: "Sorry for the trouble",
		percentOff: null,
		amountOff: { amount: 500, currency: "usd" },
		duration: "once",
		months: null,
	},
	{
		id: "PARTNER10",
		name: "Partner",
		percentOff: 10,
		amountOff: null,
		duration: "forever",
		months: null,
	},
];

const adjustAction = (id: string, label: string): CardAction[] => [
	{ id, label, style: "primary", role: "primary", input },
	{ id: "dismiss", label: "Keep as is", style: "secondary", role: "dismiss" },
];
export const couponActions = adjustAction("coupon", "Apply coupon");
export const creditActions = adjustAction("credit", "Apply to credit balance");
export const trialActions = adjustAction("trial", "Extend trial");

export const couponView: StripeAdjustView = {
	kind: "stripe.adjust",
	account,
	customer: avery,
	adjust: "coupon",
	subscription: pro,
	coupons,
	proposed: {
		coupon: "WINBACK25",
		credit: null,
		direction: "credit",
		note: "",
		trialEnd: null,
	},
};

export const couponTwoPlansView: StripeAdjustView = {
	...couponView,
	customer: averyTwoPlans,
};

export const creditView: StripeAdjustView = {
	...couponView,
	adjust: "credit",
	subscription: null,
	coupons: [],
	proposed: {
		coupon: null,
		credit: { amount: 1000, currency: "usd" },
		direction: "credit",
		note: "Goodwill for the outage on Oct 1",
		trialEnd: null,
	},
};

/** The customer holds $10.00 of credit that was given by mistake. */
export const debitView: StripeAdjustView = {
	...creditView,
	customer: averyTwoPlans,
	proposed: {
		...creditView.proposed,
		direction: "debit",
		note: "Credit added twice on Oct 1",
	},
};

export const trialView: StripeAdjustView = {
	...couponView,
	customer: blake,
	adjust: "trial",
	subscription: trialPro,
	coupons: [],
	proposed: {
		coupon: null,
		credit: null,
		direction: "credit",
		note: "",
		trialEnd: "2037-10-24T12:00:00.000Z",
	},
};

function invoice(
	n: number,
	extra: Partial<StripeInvoiceView> = {},
): StripeInvoiceView {
	const id = `in_1Fixture${String(n).padStart(12, "0")}`;
	return {
		id,
		number: `LUMEN-00${n}`,
		status: "open",
		amountDue: 2000,
		amountPaid: 0,
		amountRemaining: extra.amountDue ?? 2000,
		total: 2000,
		currency: "usd",
		created: "2037-10-03T12:00:00.000Z",
		dueDate: null,
		collection: "charge_automatically",
		lines: [{ description: "1 × Pro (at $20.00 / month)", amount: 2000 }],
		attempts: 0,
		nextAttempt: null,
		lastError: null,
		hostedUrl: `https://invoice.stripe.com/i/acct_1Fixture/test_${id}`,
		url: dashboard(`invoices/${id}`),
		...extra,
	};
}

export const failedInvoice = invoice(41, {
	attempts: 2,
	nextAttempt: "2037-10-08T12:00:00.000Z",
	lastError: "Your card has insufficient funds.",
});

export const RETRY_CONFIRM =
	"Charge $20.00 to Devon Park's Mastercard •••• 4444 now?";

export const failedPaymentActions: CardAction[] = [
	{
		id: "retry",
		label: "Charge customer",
		style: "primary",
		role: "primary",
		confirm: RETRY_CONFIRM,
	},
	{
		id: "send_link",
		label: "Send update-card link",
		style: "secondary",
		role: "other",
		input,
	},
	{ id: "dismiss", label: "Leave it", style: "secondary", role: "dismiss" },
];

export const failedPaymentView: StripeFailedPaymentView = {
	kind: "stripe.failed_payment",
	account,
	customer: devon,
	invoice: failedInvoice,
	charged: { ...mastercard, expMonth: 4, expYear: 2039 },
	email: {
		to: "devon@example.com",
		subject: "Your Lumen Labs payment did not go through",
		draft:
			"Hi Devon,\n\nYour card was declined for this month's Pro payment. You can pay or update the card with the link below.\n\nRiya",
		canSend: true,
	},
};

export const SUBMIT_CONFIRM =
	"Submit this evidence to the bank for the $49.00 dispute on Avery Chen's Visa •••• 4242 charge? Evidence can be submitted once. Countering a dispute has a fee in addition to the dispute fee. You get it back if you win.";
export const ACCEPT_CONFIRM =
	"Accept the $49.00 dispute on Avery Chen's Visa •••• 4242 charge? You lose this dispute and the customer is refunded. This closes the dispute and you can no longer submit evidence.";
export const RESPOND_CONFIRM =
	"Send this response to the bank for the $49.00 inquiry on Avery Chen's Visa •••• 4242 charge? A response can be sent once.";
export const INQUIRY_REFUND_CONFIRM =
	"Refund $49.00 on Avery Chen's Visa •••• 4242 charge? A full refund resolves the inquiry. No money has left your account for it yet.";

export const disputeActions: CardAction[] = [
	{
		id: "submit",
		label: "Submit evidence",
		style: "primary",
		role: "primary",
		input,
		confirm: SUBMIT_CONFIRM,
	},
	{ id: "save", label: "Save draft", style: "secondary", role: "other", input },
	{
		id: "accept",
		label: "Accept dispute",
		style: "danger",
		role: "other",
		confirm: ACCEPT_CONFIRM,
	},
];

export const disputeView: StripeDisputeView = {
	kind: "stripe.dispute",
	account,
	customer: avery,
	dispute: {
		id: "du_1Fixture000000000001",
		amount: 4900,
		currency: "usd",
		reason: "product_not_received",
		status: "needs_response",
		dueBy: "2037-10-20T12:00:00.000Z",
		pastDue: false,
		submissions: 0,
		created: "2037-10-05T12:00:00.000Z",
		url: dashboard("disputes/du_1Fixture000000000001"),
		inquiry: false,
	},
	charge: { ...packageCharge, disputed: true },
	evidence: {
		product_description:
			"Onboarding package: four live sessions with a Lumen Labs engineer.",
		customer_name: "Avery Chen",
		customer_email_address: "avery@example.com",
		billing_address: "",
		service_date: "2037-10-04",
		access_activity_log:
			"2037-10-04 09:02 UTC session 1 joined by avery@example.com\n2037-10-06 09:00 UTC session 2 joined by avery@example.com",
		uncategorized_text: "",
	},
	drafted: ["product_description", "service_date", "access_activity_log"],
};

export const inquiryActions: CardAction[] = [
	{
		id: "submit",
		label: "Respond to inquiry",
		style: "primary",
		role: "primary",
		input,
		confirm: RESPOND_CONFIRM,
	},
	{ id: "save", label: "Save draft", style: "secondary", role: "other", input },
	{
		id: "refund",
		label: "Refund customer",
		style: "danger",
		role: "other",
		confirm: INQUIRY_REFUND_CONFIRM,
	},
];

export const inquiryView: StripeDisputeView = {
	...disputeView,
	dispute: {
		...disputeView.dispute,
		reason: "fraudulent",
		status: "warning_needs_response",
		inquiry: true,
	},
	charge: packageCharge,
};

const DISPUTE_CLOSED = "This dispute no longer takes a response";
export const submittedDisputeView: StripeDisputeView = {
	...disputeView,
	dispute: { ...disputeView.dispute, status: "under_review", submissions: 1 },
	drafted: [],
};
export const closedDisputeActions: CardAction[] = disputeActions.map(
	(action) => ({ ...action, disabled: DISPUTE_CLOSED }),
);

const DEADLINE_PASSED = "The deadline for evidence has passed";
export const pastDueDisputeView: StripeDisputeView = {
	...disputeView,
	dispute: {
		...disputeView.dispute,
		dueBy: "2037-09-20T12:00:00.000Z",
		pastDue: true,
	},
};
export const pastDueDisputeActions: CardAction[] = disputeActions.map(
	(action) => ({ ...action, disabled: DEADLINE_PASSED }),
);

export const openInvoice = invoice(42, {
	amountDue: 123000,
	total: 123000,
	dueDate: "2037-11-02T12:00:00.000Z",
	collection: "send_invoice",
	lines: [
		{ description: "Team add-on (2 seats, yearly)", amount: 100000 },
		{ description: "Onboarding package", amount: 23000 },
	],
});

export const draftInvoice: StripeInvoiceView = {
	...openInvoice,
	number: null,
	status: "draft",
	hostedUrl: null,
};

export const paidInvoice: StripeInvoiceView = {
	...openInvoice,
	status: "paid",
	amountDue: 0,
	amountPaid: 123000,
	amountRemaining: 0,
};

export const SEND_CONFIRM =
	"Send LUMEN-0042 for $1,230.00 to Avery Chen at avery@example.com?";
export const MARK_PAID_CONFIRM =
	"Mark LUMEN-0042 for $1,230.00 as paid outside Stripe? No card is charged and Avery Chen owes nothing more on it.";
export const VOID_CONFIRM =
	"Void LUMEN-0042 for $1,230.00? Avery Chen can no longer pay it, and this cannot be undone.";
export const MARK_UNCOLLECTIBLE_CONFIRM =
	"Mark LUMEN-0042 for $1,230.00 as uncollectible? It is no longer open, and after this it can only be marked paid or void.";

export const invoiceActions: CardAction[] = [
	{
		id: "send",
		label: "Send again",
		style: "primary",
		role: "primary",
		confirm: SEND_CONFIRM,
	},
	{
		id: "mark_paid",
		label: "Mark as paid",
		style: "secondary",
		role: "other",
		confirm: MARK_PAID_CONFIRM,
	},
	{
		id: "void",
		label: "Void invoice",
		style: "danger",
		role: "other",
		confirm: VOID_CONFIRM,
	},
	{
		id: "mark_uncollectible",
		label: "Mark uncollectible",
		style: "secondary",
		role: "other",
		confirm: MARK_UNCOLLECTIBLE_CONFIRM,
	},
	{ id: "dismiss", label: "Leave it", style: "secondary", role: "dismiss" },
];

export const draftInvoiceActions: CardAction[] = [
	{
		id: "send",
		label: "Send invoice",
		style: "primary",
		role: "primary",
		confirm:
			"Send this draft invoice for $1,230.00 to Avery Chen at avery@example.com?",
	},
	{ id: "dismiss", label: "Leave it", style: "secondary", role: "dismiss" },
];

export const invoiceView: StripeInvoiceActionView = {
	kind: "stripe.invoice",
	account,
	customer: avery,
	invoice: openInvoice,
	to: "avery@example.com",
};

export const draftInvoiceView: StripeInvoiceActionView = {
	...invoiceView,
	invoice: draftInvoice,
};

/** Every action off for the reason an environment that may not write gives. */
export const locked = (actions: CardAction[]): CardAction[] =>
	actions.map((action) =>
		action.id === "dismiss" ? action : { ...action, disabled: WRITES_OFF },
	);
