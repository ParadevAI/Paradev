import { db, dbWs } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { env } from "../../../env";
import { stripeClient } from "../../../stripe";
import { planFromStripePrice } from "../legacy/plan-ids";
import {
	notifySubscriptionCanceled,
	notifySubscriptionStarted,
} from "../subscription-events";
import {
	getAutumnCustomer,
	organizationForStripeCustomer,
	saveStripeCustomerId,
} from "./customer";
import { tierFromFlags } from "./entitlements";
import { invalidateOrganizationBilling } from "./plan-state";
import {
	seatItem,
	subscriptionRowFromStripe,
	subscriptionTransitions,
} from "./subscription-row";

const RECENT_STRIPE_SUBSCRIPTIONS = 10;

type SubscriptionRow = typeof subscriptions.$inferSelect;
type Transaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

const STRIPE_PRICES = {
	pro: [env.STRIPE_PRO_MONTHLY_PRICE_ID, env.STRIPE_PRO_YEARLY_PRICE_ID],
	enterprise: [env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID],
};

function holdsSeats(stripeSubscription: Stripe.Subscription): boolean {
	return stripeSubscription.items.data.some(
		(item) => item.price?.recurring?.usage_type !== "metered",
	);
}

async function writeRow(
	tx: Transaction,
	args: {
		organizationId: string;
		stripeSubscription: Stripe.Subscription;
		autumnTier: "pro" | "enterprise" | null;
		isLatest: boolean;
	},
): Promise<{ previous?: SubscriptionRow; row?: SubscriptionRow }> {
	const { organizationId, stripeSubscription, isLatest } = args;
	const previous =
		(await tx.query.subscriptions.findFirst({
			where: eq(subscriptions.stripeSubscriptionId, stripeSubscription.id),
		})) ??
		(isLatest
			? await tx.query.subscriptions.findFirst({
					where: and(
						eq(subscriptions.referenceId, organizationId),
						isNull(subscriptions.stripeSubscriptionId),
						eq(subscriptions.status, "incomplete"),
					),
					orderBy: desc(subscriptions.createdAt),
				})
			: undefined);
	if (!previous && !isLatest) return {};
	const plan =
		(isLatest ? args.autumnTier : null) ??
		planFromStripePrice(
			seatItem(stripeSubscription)?.price.id,
			STRIPE_PRICES,
		) ??
		previous?.plan;
	if (!plan) {
		console.warn(
			`[billing/projection] ${organizationId} subscription ${stripeSubscription.id} matches no plan; not recorded`,
		);
		return {};
	}
	const values = {
		...subscriptionRowFromStripe(stripeSubscription),
		plan,
		referenceId: organizationId,
		updatedAt: new Date(),
	};
	if (previous) {
		const [row] = await tx
			.update(subscriptions)
			.set(values)
			.where(eq(subscriptions.id, previous.id))
			.returning();
		return { previous, row };
	}
	const [row] = await tx.insert(subscriptions).values(values).returning();
	return { row };
}

async function resolveStripeCustomerId(
	organizationId: string,
): Promise<string | null> {
	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.id, organizationId),
		columns: { stripeCustomerId: true },
	});
	if (org?.stripeCustomerId) return org.stripeCustomerId;
	const customer = await getAutumnCustomer(organizationId);
	return saveStripeCustomerId(organizationId, customer.stripeId);
}

async function autumnTierFor(
	organizationId: string,
): Promise<"pro" | "enterprise" | null> {
	try {
		const tier = tierFromFlags((await getAutumnCustomer(organizationId)).flags);
		return tier === "free" ? null : tier;
	} catch (error) {
		console.error(
			`[billing/projection] ${organizationId} Autumn lookup failed`,
			error,
		);
		return null;
	}
}

/**
 * Rewrites an organization's `subscriptions` rows: the tier from Autumn's
 * access features, the Stripe ids and periods from the Stripe subscription
 * Autumn manages (Autumn does not expose those ids, and seat sync, the Slack
 * jobs and purge need them). Sends the started and cancelled notices.
 */
export async function syncOrganizationSubscription(
	organizationId: string,
): Promise<void> {
	await invalidateOrganizationBilling(organizationId);
	const stripeCustomerId = await resolveStripeCustomerId(organizationId);
	if (!stripeCustomerId) return;

	const changes = await dbWs.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`billing-sync:${organizationId}`}, 0))`,
		);
		const [autumnTier, listed] = await Promise.all([
			autumnTierFor(organizationId),
			stripeClient.subscriptions.list({
				customer: stripeCustomerId,
				status: "all",
				limit: RECENT_STRIPE_SUBSCRIPTIONS,
			}),
		]);
		const seatSubscriptions = listed.data.filter(holdsSeats);
		const payingRows = await tx.query.subscriptions.findMany({
			where: and(
				eq(subscriptions.referenceId, organizationId),
				inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
			),
			columns: { stripeSubscriptionId: true },
		});
		const written = [];
		for (const [index, stripeSubscription] of seatSubscriptions.entries()) {
			const { previous, row } = await writeRow(tx, {
				organizationId,
				stripeSubscription,
				autumnTier,
				isLatest: index === 0,
			});
			if (!row) continue;
			const organizationAlreadyPaying = payingRows.some(
				(paying) => paying.stripeSubscriptionId !== stripeSubscription.id,
			);
			written.push({
				previous,
				row,
				stripeSubscription,
				organizationAlreadyPaying,
			});
		}
		return written;
	});

	for (const {
		previous,
		row,
		stripeSubscription,
		organizationAlreadyPaying,
	} of changes) {
		const transitions = subscriptionTransitions(
			previous,
			stripeSubscription,
			organizationAlreadyPaying,
		);
		if (transitions.started) {
			await notifySubscriptionStarted({
				subscription: row,
				stripeSubscription,
				planName: row.plan,
			});
		}
		if (transitions.canceled) {
			await notifySubscriptionCanceled({
				subscription: row,
				stripeSubscription,
				cancellationDetails: stripeSubscription.cancellation_details,
			});
		}
	}
}

export async function syncFromStripeEvent(event: Stripe.Event): Promise<void> {
	const object = event.data.object as {
		customer?: string | { id: string } | null;
		metadata?: Record<string, string> | null;
	};
	const customerId =
		typeof object.customer === "string" ? object.customer : object.customer?.id;
	if (!customerId) return;
	const organizationId = await organizationForStripeCustomer(
		customerId,
		object.metadata,
	);
	if (organizationId) await syncOrganizationSubscription(organizationId);
}

export async function completeCheckout(
	checkoutSessionId: string,
): Promise<void> {
	if (!checkoutSessionId.startsWith("cs_")) return;
	const session =
		await stripeClient.checkout.sessions.retrieve(checkoutSessionId);
	const customerId =
		typeof session.customer === "string"
			? session.customer
			: session.customer?.id;
	if (!customerId) return;
	const organizationId = await organizationForStripeCustomer(customerId, {
		...(session.metadata ?? {}),
		...(session.client_reference_id
			? { organizationId: session.client_reference_id }
			: {}),
	});
	if (organizationId) await syncOrganizationSubscription(organizationId);
}
