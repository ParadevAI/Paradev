import { useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import type {
	StripeCardView,
	StripeCouponView,
	StripeCustomerView,
	StripeSubscriptionView,
} from "../../types";
import { stripeDate } from "../../utils/stripeDate";
import { parseMoneyInput, stripeMoney } from "../../utils/stripeMoney";

const humanize = (value: string) => {
	const words = value.replaceAll("_", " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The words the Stripe cards share: a card, a customer, a status, a price, a coupon's terms, a balance, what is wrong with a typed amount. */
export function useStripeLabels() {
	const { t } = useLingui();

	const cardLabel = (card: StripeCardView | null) =>
		card
			? `${card.brand.charAt(0).toUpperCase()}${card.brand.slice(1)} •••• ${card.last4}`
			: t({ message: "the payment method on file" });

	/** "10 / 2027", as Stripe writes when a card expires. */
	const cardExpiry = (card: StripeCardView) =>
		card.expMonth && card.expYear
			? `${String(card.expMonth).padStart(2, "0")} / ${card.expYear}`
			: null;

	const customerName = (customer: StripeCustomerView | null) =>
		customer?.name ?? customer?.email ?? t({ message: "this customer" });

	const statuses: Record<string, string> = {
		active: t({ message: "Active" }),
		trialing: t({ message: "Trialing" }),
		past_due: t({ message: "Past due" }),
		canceled: t({ message: "Canceled" }),
		unpaid: t({ message: "Unpaid" }),
		incomplete: t({ message: "Incomplete" }),
		incomplete_expired: t({ message: "Expired" }),
		paused: t({ message: "Paused" }),
		succeeded: t({ message: "Succeeded" }),
		pending: t({ message: "Pending" }),
		failed: t({ message: "Failed" }),
		draft: t({ message: "Draft", context: "invoice status" }),
		open: t({ message: "Open", context: "invoice status" }),
		paid: t({ message: "Paid" }),
		uncollectible: t({ message: "Uncollectible" }),
		void: t({ message: "Void" }),
		needs_response: t({ message: "Needs response" }),
		under_review: t({ message: "Under review" }),
		won: t({ message: "Won" }),
		lost: t({ message: "Lost" }),
		warning_needs_response: t({ message: "Inquiry" }),
		warning_under_review: t({ message: "Inquiry under review" }),
		warning_closed: t({ message: "Inquiry closed" }),
	};
	const statusLabel = (status: string) => statuses[status] ?? humanize(status);

	const reasons: Record<string, string> = {
		bank_cannot_process: t({ message: "Bank cannot process" }),
		check_returned: t({ message: "Check returned" }),
		credit_not_processed: t({ message: "Credit not processed" }),
		customer_initiated: t({ message: "Customer initiated" }),
		debit_not_authorized: t({ message: "Debit not authorized" }),
		duplicate: t({ message: "Duplicate" }),
		fraudulent: t({ message: "Fraudulent" }),
		general: t({ message: "General" }),
		incorrect_account_details: t({ message: "Incorrect account details" }),
		insufficient_funds: t({ message: "Insufficient funds" }),
		noncompliant: t({ message: "Noncompliant" }),
		product_not_received: t({ message: "Product not received" }),
		product_unacceptable: t({ message: "Product unacceptable" }),
		subscription_canceled: t({ message: "Subscription canceled" }),
		unrecognized: t({ message: "Unrecognized" }),
	};
	const disputeReason = (reason: string) => reasons[reason] ?? humanize(reason);

	const priceLabel = ({
		amount,
		currency,
		interval,
		intervalCount,
	}: StripeSubscriptionView["price"]) => {
		const price = stripeMoney(amount, currency);
		const count = intervalCount;
		if (count === 1) {
			if (interval === "day") return t({ message: `${price} per day` });
			if (interval === "week") return t({ message: `${price} per week` });
			if (interval === "month") return t({ message: `${price} per month` });
			if (interval === "year") return t({ message: `${price} per year` });
		} else {
			if (interval === "day")
				return t({ message: `${price} every ${count} days` });
			if (interval === "week")
				return t({ message: `${price} every ${count} weeks` });
			if (interval === "month")
				return t({ message: `${price} every ${count} months` });
			if (interval === "year")
				return t({ message: `${price} every ${count} years` });
		}
		return price;
	};

	const pausedLabel = (
		paused: NonNullable<StripeSubscriptionView["paused"]>,
	) => {
		if (!paused.resumesAt) return t({ message: "Paused indefinitely" });
		const date = stripeDate(paused.resumesAt);
		return t({ message: `Paused until ${date}` });
	};

	const couponTerms = (coupon: StripeCouponView) => {
		const off =
			coupon.percentOff !== null
				? formatPercent(coupon.percentOff / 100)
				: coupon.amountOff
					? stripeMoney(coupon.amountOff.amount, coupon.amountOff.currency)
					: null;
		if (off === null) return coupon.name;
		if (coupon.duration === "forever")
			return t({ message: `${off} off forever` });
		if (coupon.duration === "once") return t({ message: `${off} off once` });
		const months = coupon.months ?? 1;
		return months === 1
			? t({ message: `${off} off for 1 month` })
			: t({ message: `${off} off for ${months} months` });
	};

	const couponLabel = (coupon: StripeCouponView) => {
		const terms = couponTerms(coupon);
		return terms === coupon.name ? coupon.name : `${coupon.name} – ${terms}`;
	};

	/** A credit the customer holds reads in parentheses, as Stripe writes it. */
	const balanceLabel = (credit: number, currency: string) =>
		credit > 0
			? `(${stripeMoney(credit, currency)})`
			: stripeMoney(Math.abs(credit), currency);

	/** Stripe's sentence under an amount that is zero or over `max`; null when it has none. */
	const amountError = (text: string, currency: string, max: number) => {
		const amount = parseMoneyInput(text, currency);
		if (text.trim() === "" || amount === 0) {
			const zero = stripeMoney(0, currency);
			return t({ message: `Amount cannot be ${zero}.` });
		}
		if (amount !== null && amount > max) {
			const most = stripeMoney(max, currency);
			return t({ message: `Amount cannot be more than ${most}.` });
		}
		return null;
	};

	return {
		cardLabel,
		cardExpiry,
		customerName,
		statusLabel,
		disputeReason,
		priceLabel,
		pausedLabel,
		couponTerms,
		couponLabel,
		balanceLabel,
		amountError,
	};
}
