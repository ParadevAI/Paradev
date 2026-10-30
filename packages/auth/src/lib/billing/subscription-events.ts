import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { PlanUpgradedEmail } from "@superset/email/emails/billing/plan-upgraded";
import { SubscriptionCancelledEmail } from "@superset/email/emails/billing/subscription-cancelled";
import { SubscriptionStartedEmail } from "@superset/email/emails/billing/subscription-started";
import { NOREPLY_FROM } from "@superset/email/sender";
import type { PlanFamily } from "@superset/shared/billing";
import { Client } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { env } from "../../env";
import { syncCustomerName } from "../../stripe";
import {
	formatPrice,
	getOrganizationBillingRecipients,
	getOrganizationOwners,
} from "../../utils/billing";
import { captureBillingEvent } from "../billing-analytics";
import { resend } from "../resend";
import { cloudHoursPerSeat, type EmailPlan } from "./autumn/plan-family";
import { seatItem } from "./autumn/subscription-row";

const qstash = new Client({ token: env.QSTASH_TOKEN });

export const NOTIFY_SLACK_URL = `${env.NEXT_PUBLIC_API_URL}/api/integrations/stripe/jobs/notify-slack`;

export interface SubscriptionEventRow {
	referenceId: string;
	plan: string;
	seats?: number | null;
	periodEnd?: Date | null;
}

/**
 * Backfills GitHub for a paying organization. Its deliveries are dropped at the
 * webhook while an org is on the free plan, so whatever changed in the gap is
 * missing until this job replays it.
 */
async function resumeGatedSyncs(organizationId: string): Promise<void> {
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.organizationId, organizationId),
		columns: { id: true },
	});
	if (!installation) return;

	try {
		await qstash.publishJSON({
			url: `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`,
			body: { installationDbId: installation.id, organizationId },
			retries: 3,
		});
	} catch (error) {
		console.error(
			"[stripe/subscription-complete] Failed to queue integration backfill:",
			error,
		);
	}
}

export function serializeCancellationDetails(
	cancellationDetails?: Stripe.Subscription.CancellationDetails | null,
) {
	try {
		if (!cancellationDetails) return undefined;

		return {
			comment: cancellationDetails.comment,
			feedback: cancellationDetails.feedback,
			reason: cancellationDetails.reason,
		};
	} catch (error) {
		console.error(
			"[stripe/subscription-cancel] Failed to serialize cancellation details:",
			error,
		);
		return undefined;
	}
}

function seatPrice(stripeSubscription: Stripe.Subscription) {
	const price = seatItem(stripeSubscription)?.price;
	const billingInterval: "monthly" | "yearly" =
		price?.recurring?.interval === "year" ? "yearly" : "monthly";
	const pricePerSeat = price?.unit_amount ?? 0;
	const currency = price?.currency ?? "usd";
	return {
		billingInterval,
		pricePerSeat,
		currency,
		amount: formatPrice(pricePerSeat, currency),
	};
}

function displayPlanName(planName: string): string {
	return planName.charAt(0).toUpperCase() + planName.slice(1);
}

export async function notifyPlanUpgraded({
	subscription,
	stripeSubscription,
	plan,
	previousFamily,
}: {
	subscription: SubscriptionEventRow;
	stripeSubscription: Stripe.Subscription;
	plan: EmailPlan;
	previousFamily: PlanFamily;
}): Promise<boolean> {
	try {
		const org = await db.query.organizations.findFirst({
			where: eq(authSchema.organizations.id, subscription.referenceId),
		});
		if (!org) return true;
		const owners = await getOrganizationOwners(subscription.referenceId);
		const { billingInterval, amount } = seatPrice(stripeSubscription);
		const { error } = await resend.batch.send(
			owners.map((owner) => ({
				from: NOREPLY_FROM,
				to: owner.email,
				subject: `You're on Paradev ${plan.name}`,
				react: PlanUpgradedEmail({
					ownerName: owner.name,
					organizationName: org.name,
					planName: plan.name,
					previousPlanName: previousFamily.name,
					billingInterval,
					amount,
					seatCount: subscription.seats ?? 1,
					cloudHoursPerSeat: plan.cloudHoursPerSeat,
					previousCloudHoursPerSeat: cloudHoursPerSeat(previousFamily),
				}),
			})),
		);
		if (error) throw new Error(error.message);
		return true;
	} catch (error) {
		console.error(
			`[billing/plan-upgraded] ${subscription.referenceId} upgrade notice failed`,
			error,
		);
		return false;
	}
}

export async function notifySubscriptionStarted({
	subscription,
	stripeSubscription,
	planName,
	plan = null,
}: {
	subscription: SubscriptionEventRow;
	stripeSubscription: Stripe.Subscription;
	planName: string;
	plan?: EmailPlan | null;
}): Promise<void> {
	await resumeGatedSyncs(subscription.referenceId);

	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.id, subscription.referenceId),
	});

	if (!org) return;

	if (planName === "enterprise") return;

	if (org.stripeCustomerId) {
		await syncCustomerName(org.stripeCustomerId, org.name).catch((error) => {
			console.error(
				"[stripe/subscription-complete] Failed to restore customer name:",
				error,
			);
		});
	}

	const owners = await getOrganizationOwners(subscription.referenceId);
	const { billingInterval, pricePerSeat, currency, amount } =
		seatPrice(stripeSubscription);
	const displayName = plan?.name ?? displayPlanName(planName);

	await resend.batch.send(
		owners.map((owner) => ({
			from: NOREPLY_FROM,
			to: owner.email,
			subject: `Welcome to Paradev ${displayName}!`,
			react: SubscriptionStartedEmail({
				ownerName: owner.name,
				organizationName: org.name,
				planName: displayName,
				billingInterval,
				amount,
				seatCount: subscription.seats ?? 1,
				previousPlanName: plan?.previousName,
				cloudHoursPerSeat: plan?.cloudHoursPerSeat,
			}),
		})),
	);

	try {
		await qstash.publishJSON({
			url: NOTIFY_SLACK_URL,
			body: {
				eventType: "subscription_started",
				stripeSubscriptionId: stripeSubscription.id,
			},
			retries: 3,
		});
	} catch (error) {
		console.error(
			"[stripe/subscription-complete] Failed to queue Slack notification:",
			error,
		);
	}

	// The paid conversion. Emitted here rather than from an
	// `onEvent` case for `checkout.session.completed` because Better
	// Auth calls both for that one webhook, and this hook is the side
	// that already knows the plan, seat count and interval.
	await captureBillingEvent({
		event: "subscription_started",
		organizationId: subscription.referenceId,
		initiatedByUserId: stripeSubscription.metadata?.userId,
		// This hook is handed the subscription, not the webhook event, so
		// the subscription id is the stable key. One `subscription_started`
		// per subscription is the intended meaning anyway.
		idempotencyKey: stripeSubscription.id,
		occurredAt: new Date(stripeSubscription.created * 1000),
		properties: {
			plan: planName,
			billing_interval: billingInterval,
			seats: subscription.seats ?? 1,
			// Deliberately not `revenue`: that property is what PostHog
			// revenue analytics sums, and `payment_succeeded` below is the
			// one event where money actually moved. Naming it here too
			// would double-count every subscription.
			subscription_value: pricePerSeat * (subscription.seats ?? 1),
			currency,
			stripe_subscription_id: stripeSubscription.id,
		},
	});
}

export async function notifySubscriptionCanceled({
	subscription,
	stripeSubscription,
	cancellationDetails,
}: {
	subscription: SubscriptionEventRow;
	stripeSubscription: Stripe.Subscription;
	cancellationDetails?: Stripe.Subscription.CancellationDetails | null;
}): Promise<void> {
	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.id, subscription.referenceId),
	});

	if (!org?.stripeCustomerId) return;

	const recipients = await getOrganizationBillingRecipients(
		subscription.referenceId,
	);
	const accessEndsAt = subscription.periodEnd ?? new Date();

	// periodEnd is the period Stripe was trying to bill for, so on a
	// collection failure it sits weeks in the future while access has
	// already stopped. Only a voluntary cancel keeps access until then.
	const dueToPaymentFailure =
		(cancellationDetails ?? stripeSubscription.cancellation_details)?.reason ===
		"payment_failed";

	if (
		subscription.plan === "pro" &&
		!dueToPaymentFailure &&
		stripeSubscription.canceled_at
	) {
		try {
			await qstash.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/stripe/jobs/cancellation-feedback`,
				body: {
					stripeSubscriptionId: stripeSubscription.id,
					canceledAt: stripeSubscription.canceled_at,
				},
				delay: 2700,
				retries: 3,
				deduplicationId: `pro-cancellation-feedback-${stripeSubscription.id}-${stripeSubscription.canceled_at}`,
			});
		} catch (error) {
			console.error(
				"[stripe/cancellation-feedback] Failed to queue feedback:",
				error,
			);
		}
	}

	await resend.batch.send(
		recipients.map((recipient) => ({
			from: NOREPLY_FROM,
			to: recipient.email,
			subject: dueToPaymentFailure
				? `Your ${subscription.plan} subscription ended`
				: `Your ${subscription.plan} subscription has been cancelled`,
			react: SubscriptionCancelledEmail({
				recipientName: recipient.name,
				organizationName: org.name,
				planName: subscription.plan,
				accessEndsAt,
				dueToPaymentFailure,
			}),
		})),
	);

	try {
		await qstash.publishJSON({
			url: NOTIFY_SLACK_URL,
			body: {
				eventType: "subscription_cancelled",
				stripeSubscriptionId: stripeSubscription.id,
				cancellationDetails: serializeCancellationDetails(
					cancellationDetails ?? stripeSubscription.cancellation_details,
				),
			},
			retries: 3,
			// portal collects the cancellation survey after cancel confirms; give it time
			delay: 120,
		});
	} catch (error) {
		console.error(
			"[stripe/subscription-cancel] Failed to queue Slack notification:",
			error,
		);
	}
}
