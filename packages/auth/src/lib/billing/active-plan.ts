import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { and, desc, eq, inArray } from "drizzle-orm";
import { billingUsesAutumn } from "../../autumn";
import { organizationBilling } from "./autumn/plan-state";

const EMPTY_ACTIVE_PLAN = {
	plan: "free" as const,
	autumnPlanId: null,
	planTier: "free",
	/** @deprecated TODO(2027-01-31): Stripe vocabulary; read `paymentState`. */
	status: null,
	cancelAt: null,
	scheduledPlanId: null,
	scheduledAt: null,
	periodStart: null,
	periodEnd: null,
	billingInterval: null,
	/**
	 * Free because a subscription ended, not because there never was one. The
	 * distinction has to be made here, from rows we already read: the caller
	 * uses it to decide whether to ask Stripe about an unpaid invoice, and
	 * doing that for every free organization would put a Stripe round-trip on
	 * every app load for everyone who ever paid us.
	 *
	 * @deprecated TODO(2027-01-31): read `paymentState`.
	 */
	lapsed: false,
};

export async function organizationActivePlan(activeOrgId: string | null) {
	const billingProvider = billingUsesAutumn
		? ("autumn" as const)
		: ("stripe" as const);
	if (!activeOrgId) {
		return { ...EMPTY_ACTIVE_PLAN, organizationId: null, billingProvider };
	}

	if (billingUsesAutumn) {
		const billing = await organizationBilling(activeOrgId);
		const date = (value: string | null) => (value ? new Date(value) : null);
		return {
			organizationId: activeOrgId,
			plan: billing.tier,
			autumnPlanId: billing.autumnPlanId ?? null,
			planTier: billing.planTier ?? billing.tier,
			status: billing.status,
			cancelAt: date(billing.cancelAt),
			scheduledPlanId: billing.scheduledPlanId ?? null,
			scheduledAt: date(billing.scheduledAt ?? null),
			periodStart: date(billing.periodStart),
			periodEnd: date(billing.periodEnd),
			billingInterval: billing.billingInterval,
			lapsed: billing.lapsed,
			paymentState: billing.paymentState,
			billingProvider,
		};
	}

	const subscription = await db.query.subscriptions.findFirst({
		where: and(
			eq(subscriptions.referenceId, activeOrgId),
			inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
		),
		orderBy: desc(subscriptions.createdAt),
	});

	if (!subscription) {
		const previous = await db.query.subscriptions.findFirst({
			where: eq(subscriptions.referenceId, activeOrgId),
			orderBy: desc(subscriptions.createdAt),
			columns: { status: true },
		});

		// `unpaid` as well as `canceled`: which one Stripe lands on after it
		// stops retrying is a dashboard setting, and checking only for
		// `canceled` would make this silently stop working if that changed.
		// `incomplete` is excluded on purpose — that subscription never began.
		return {
			...EMPTY_ACTIVE_PLAN,
			organizationId: activeOrgId,
			lapsed: previous?.status === "canceled" || previous?.status === "unpaid",
			billingProvider,
		};
	}

	return {
		organizationId: activeOrgId,
		plan: subscription.plan,
		autumnPlanId: null,
		planTier: subscription.plan ?? "free",
		status: subscription.status,
		cancelAt: subscription.cancelAt,
		scheduledPlanId: null,
		scheduledAt: null,
		periodStart: subscription.periodStart,
		periodEnd: subscription.periodEnd,
		billingInterval: subscription.billingInterval,
		lapsed: false,
		billingProvider,
	};
}
