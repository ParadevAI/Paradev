import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { AutumnError } from "autumn-js";
import { APIError } from "better-auth/api";
import { and, desc, eq, inArray } from "drizzle-orm";
import { autumnClient } from "../../../autumn";
import { env } from "../../../env";
import { stripeClient } from "../../../stripe";
import { countBillableSeats } from "../../../utils/billing";
import { billingFromCustomer } from "../autumn/billing-state";
import { catalogAutumnPlans, seatLicenseFor } from "../autumn/catalog";
import {
	ensureAutumnCustomer,
	getAutumnCustomer,
	heldAutumnPlanId,
} from "../autumn/customer";
import { paidPlanIdFromFlags } from "../autumn/entitlements";
import { SEATS_FEATURE_ID } from "../autumn/features";
import {
	completeCheckout,
	syncFromStripeEvent,
	syncOrganizationSubscription,
} from "../autumn/projection";
import { yearlyRenewalStart } from "../autumn/routes";
import { seatPurchase } from "../autumn/seats";
import { handleStripeBillingEvent } from "../stripe-billing-events";
import { currentPlanIdForLegacy, isProFamilyPlan } from "./plan-ids";
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
		attach: async ({ featureQuantities, ...params }) => {
			const quantity = featureQuantities?.find(
				(item) => item.featureId === SEATS_FEATURE_ID,
			)?.quantity;
			if (quantity === undefined)
				throw new Error("Missing checkout seat quantity");
			const planId = currentPlanIdForLegacy(
				params.planId,
				await catalogAutumnPlans(),
			);
			const { quantities } = await seatPurchase(planId, quantity);
			const startsAt = await yearlyRenewalStart(params.customerId, planId, () =>
				autumn.billing.previewAttach({
					customerId: params.customerId,
					planId,
					...quantities,
				}),
			);
			return autumn.billing.attach({
				...params,
				planId,
				...quantities,
				...(startsAt && { startsAt }),
			});
		},
		update: (params) => autumn.billing.update(params),
		managedByAutumn: async (organizationId) =>
			(await heldAutumnPlanId(organizationId)) !== null,
		...stripeFallback(stripeClient, {
			monthly: env.STRIPE_PRO_MONTHLY_PRICE_ID,
			yearly: env.STRIPE_PRO_YEARLY_PRICE_ID,
		}),
		ensureCustomer: ensureAutumnCustomer,
		currentPlanId: heldAutumnPlanId,
		isProFamilyPlan: async (planId) =>
			isProFamilyPlan(planId, await catalogAutumnPlans()),
		findLiveSubscription: async (organizationId) => {
			const legacy = await db.query.subscriptions.findFirst({
				where: and(
					eq(subscriptions.referenceId, organizationId),
					inArray(subscriptions.status, ["active", "trialing", "past_due"]),
				),
				orderBy: desc(subscriptions.createdAt),
			});
			const customer = await getAutumnCustomer(organizationId).catch(
				(error: unknown) => {
					if (error instanceof AutumnError && error.statusCode === 404)
						return null;
					throw error;
				},
			);
			const planId = customer && paidPlanIdFromFlags(customer.flags);
			if (!customer || !planId) return legacy ?? null;
			const license = await seatLicenseFor(planId);
			const billing = billingFromCustomer(
				customer,
				Date.now(),
				license?.price?.interval ?? null,
			);
			return {
				plan: billing.tier,
				status: billing.status ?? "active",
				billingInterval: billing.billingInterval,
				cancelAtPeriodEnd: billing.cancelAt !== null,
				cancelAt: billing.cancelAt ? new Date(billing.cancelAt) : null,
				stripeSubscriptionId: legacy?.stripeSubscriptionId ?? null,
				stripeCustomerId: customer.stripeId ?? legacy?.stripeCustomerId ?? null,
				stripeScheduleId: legacy?.stripeScheduleId ?? null,
			};
		},
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
