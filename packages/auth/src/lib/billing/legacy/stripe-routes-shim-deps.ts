import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { APIError } from "better-auth/api";
import { and, desc, eq, inArray } from "drizzle-orm";
import { autumnClient } from "../../../autumn";
import { env } from "../../../env";
import { stripeClient } from "../../../stripe";
import { countBillableSeats } from "../../../utils/billing";
import { ensureAutumnCustomer, paidAutumnPlanId } from "../autumn/customer";
import {
	completeCheckout,
	syncFromStripeEvent,
	syncOrganizationSubscription,
} from "../autumn/projection";
import { handleStripeBillingEvent } from "../stripe-billing-events";
import { stripeFallback } from "./stripe-fallback";
import type { AutumnBillingDeps } from "./stripe-routes-shim";

const SYNCED_STRIPE_EVENTS = new Set([
	"checkout.session.completed",
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
	"invoice.paid",
	"invoice.payment_failed",
]);

/** @deprecated See withAutumnBilling. */
// TODO(2027-01-31): drop with the shim.
export function autumnBillingDeps(): AutumnBillingDeps {
	const autumn = autumnClient;
	return {
		attach: (params) => autumn.billing.attach(params),
		update: (params) => autumn.billing.update(params),
		managedByAutumn: async (organizationId) =>
			(await paidAutumnPlanId(organizationId).catch(() => null)) !== null,
		...stripeFallback(stripeClient, {
			monthly: env.STRIPE_PRO_MONTHLY_PRICE_ID,
			yearly: env.STRIPE_PRO_YEARLY_PRICE_ID,
		}),
		ensureCustomer: ensureAutumnCustomer,
		currentPlanId: paidAutumnPlanId,
		findLiveSubscription: async (organizationId) =>
			(await db.query.subscriptions.findFirst({
				where: and(
					eq(subscriptions.referenceId, organizationId),
					inArray(subscriptions.status, ["active", "trialing"]),
				),
				orderBy: desc(subscriptions.createdAt),
			})) ?? null,
		countBillableSeats,
		sync: syncOrganizationSubscription,
		completeCheckout,
		handleStripeWebhook: async (request) => {
			const signature = request.headers.get("stripe-signature");
			if (!signature) {
				throw new APIError("BAD_REQUEST", {
					message: "Stripe webhook secret not found",
				});
			}
			const event = await stripeClient.webhooks
				.constructEventAsync(
					await request.text(),
					signature,
					env.STRIPE_WEBHOOK_SECRET,
				)
				.catch(() => {
					throw new APIError("BAD_REQUEST", {
						message: "Failed to construct Stripe event",
					});
				});
			if (SYNCED_STRIPE_EVENTS.has(event.type)) {
				await syncFromStripeEvent(event);
			}
			await handleStripeBillingEvent(event);
		},
	};
}
