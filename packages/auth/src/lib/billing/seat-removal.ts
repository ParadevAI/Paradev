import type { MemberRemovedBillingEmail } from "@superset/email/emails/billing/member-removed";
import type Stripe from "stripe";
import { formatPrice } from "../../utils/billing";
import type { NextInvoicePreview } from "../../utils/invoice-preview";
import { seatItem } from "./autumn/subscription-row";

export type SeatRemoval = {
	organization: { id: string; name: string };
	member: { name: string | null; email: string };
	/** Null when the member left on their own. */
	removedByName: string | null;
};

export type SeatRemovalDeps = {
	activeSubscription: (
		organizationId: string,
	) => Promise<
		{ stripeSubscriptionId: string | null; plan: string } | undefined
	>;
	countSeats: (organizationId: string) => Promise<number>;
	retrieveStripeSubscription: (
		subscriptionId: string,
	) => Promise<Pick<Stripe.Subscription, "items" | "customer">>;
	/** False when Autumn does not own this organization's seats. */
	setAutumnSeats: (
		organizationId: string,
		quantity: number,
	) => Promise<boolean>;
	updateStripeSeats: (args: {
		subscriptionId: string;
		itemId: string;
		quantity: number;
	}) => Promise<void>;
	billingRecipients: (
		organizationId: string,
	) => Promise<{ name: string | null; email: string }[]>;
	previewCredit: (args: {
		customerId: string;
		subscriptionId: string;
		itemId: string;
	}) => Promise<NextInvoicePreview | null>;
	sendEmails: (
		emails: {
			to: string;
			subject: string;
			props: Parameters<typeof MemberRemovedBillingEmail>[0];
		}[],
	) => Promise<void>;
	notifySlack: (body: {
		eventType: "seat_removed";
		stripeSubscriptionId: string;
		memberName: string;
		previousSeats: number;
		newSeats: number;
	}) => Promise<void>;
};

export async function syncSeatsAfterRemoval(
	{ organization, member, removedByName }: SeatRemoval,
	deps: SeatRemovalDeps,
) {
	const subscription = await deps.activeSubscription(organization.id);
	if (!subscription?.stripeSubscriptionId) return;
	if (subscription.plan === "enterprise") return;
	const subscriptionId = subscription.stripeSubscriptionId;
	const quantity = Math.max(1, await deps.countSeats(organization.id));

	const stripeSub = await deps.retrieveStripeSubscription(subscriptionId);
	const seat = seatItem(stripeSub);
	const itemId = seat?.id;

	const seatsOwnedByAutumn = await deps.setAutumnSeats(
		organization.id,
		quantity,
	);
	// TODO(2027-01-31): drop the direct Stripe write once every paid org is imported into Autumn.
	if (!seatsOwnedByAutumn && itemId) {
		await deps.updateStripeSeats({ subscriptionId, itemId, quantity });
	}

	const recipients = await deps.billingRecipients(organization.id);
	const pricePerSeat = seat?.price?.unit_amount ?? 0;
	const currency = seat?.price?.currency ?? "usd";
	const newMonthlyTotal = formatPrice(pricePerSeat * quantity, currency);
	// unit_amount is per billing period: on an annual price the total
	// above is yearly, and calling it monthly understates it 12x.
	const billingInterval =
		seat?.price?.recurring?.interval === "year"
			? ("yearly" as const)
			: ("monthly" as const);

	const customerId =
		typeof stripeSub.customer === "string"
			? stripeSub.customer
			: stripeSub.customer.id;
	const preview = itemId
		? await deps.previewCredit({ customerId, subscriptionId, itemId })
		: null;

	const memberName = member.name ?? "Former member";
	const subject =
		removedByName === null
			? `Billing update: Member left ${organization.name}`
			: `Billing update: Member removed from ${organization.name}`;
	await deps.sendEmails(
		recipients.map((recipient) => ({
			to: recipient.email,
			subject,
			props: {
				recipientName: recipient.name,
				prorationAmount: preview?.prorationAmount ?? null,
				nextInvoiceTotal: preview?.nextInvoiceTotal ?? null,
				organizationName: organization.name,
				removedMemberName: memberName,
				removedMemberEmail: member.email,
				removedByName,
				newSeatCount: quantity,
				newMonthlyTotal,
				billingInterval,
			},
		})),
	);

	try {
		await deps.notifySlack({
			eventType: "seat_removed",
			stripeSubscriptionId: subscriptionId,
			memberName,
			previousSeats: quantity + 1,
			newSeats: quantity,
		});
	} catch (error) {
		console.error(
			"[org/seat-removal] Failed to queue Slack notification:",
			error,
		);
	}
}
