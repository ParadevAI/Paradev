import { APIError } from "better-auth/api";
import type Stripe from "stripe";
import { seatItem } from "../autumn/subscription-row";
import type { AutumnBillingDeps } from "./stripe-routes-shim";

export type StripeFallbackClient = {
	billingPortal: Pick<Stripe["billingPortal"], "sessions">;
	subscriptions: Pick<Stripe["subscriptions"], "retrieve" | "update">;
	subscriptionSchedules: Pick<
		Stripe["subscriptionSchedules"],
		"retrieve" | "release"
	>;
};

/**
 * @deprecated Stripe calls for subscribers Autumn does not manage yet, and the
 * cancel deep link Autumn's portal call cannot open.
 */
// TODO(2027-01-31): drop with the shim, once released desktops are past the first build on /api/auth/autumn/*.
export function stripeFallback(
	stripe: StripeFallbackClient,
	prices: { monthly: string; yearly: string },
): Pick<
	AutumnBillingDeps,
	"cancelPortalUrl" | "switchIntervalPortalUrl" | "restoreInStripe"
> {
	return {
		cancelPortalUrl: async (subscription, returnUrl) => {
			const { url } = await stripe.billingPortal.sessions.create({
				customer: subscription.stripeCustomerId,
				return_url: returnUrl,
				flow_data: {
					type: "subscription_cancel",
					subscription_cancel: {
						subscription: subscription.stripeSubscriptionId,
					},
				},
			});
			return url;
		},
		switchIntervalPortalUrl: async (subscription, annual, returnUrl) => {
			const current = await stripe.subscriptions.retrieve(
				subscription.stripeSubscriptionId,
			);
			const seat = seatItem(current);
			if (!seat) {
				throw new APIError("BAD_REQUEST", {
					code: "SUBSCRIPTION_NOT_FOUND",
					message: "Subscription not found",
				});
			}
			const { url } = await stripe.billingPortal.sessions.create({
				customer: subscription.stripeCustomerId,
				return_url: returnUrl,
				flow_data: {
					type: "subscription_update_confirm",
					after_completion: {
						type: "redirect",
						redirect: { return_url: returnUrl },
					},
					subscription_update_confirm: {
						subscription: subscription.stripeSubscriptionId,
						items: [
							{
								id: seat.id,
								price: annual ? prices.yearly : prices.monthly,
								quantity: seat.quantity ?? 1,
							},
						],
					},
				},
			});
			return url;
		},
		restoreInStripe: async (subscription) => {
			if (subscription.stripeScheduleId) {
				const schedule = await stripe.subscriptionSchedules.retrieve(
					subscription.stripeScheduleId,
				);
				if (schedule.status === "active") {
					await stripe.subscriptionSchedules.release(schedule.id);
				}
				return;
			}
			const current = await stripe.subscriptions.retrieve(
				subscription.stripeSubscriptionId,
			);
			await stripe.subscriptions.update(
				current.id,
				current.cancel_at ? { cancel_at: "" } : { cancel_at_period_end: false },
			);
		},
	};
}
