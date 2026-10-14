import type { PlanTier } from "@superset/shared/billing";
import type { getAutumnCustomer } from "./customer";
import { paidPlanIdFromFlags, tierFromFlags } from "./entitlements";
import { SEATS_FEATURE_ID } from "./features";

export type PaymentState =
	| { kind: "ok" }
	| {
			kind: "past_due";
			amountDue: number | null;
			currency: string | null;
			hostedInvoiceUrl: string | null;
	  }
	| { kind: "ended_unpaid"; amountDue: number | null; currency: string | null };

export interface OrganizationBilling {
	tier: PlanTier;
	status: "active" | "trialing" | "past_due" | null;
	cancelAt: string | null;
	periodStart: string | null;
	periodEnd: string | null;
	billingInterval: string | null;
	lapsed: boolean;
	paymentState: PaymentState;
}

type AutumnCustomer = Awaited<ReturnType<typeof getAutumnCustomer>>;

const UNPAID_INVOICE = new Set(["open", "uncollectible"]);

function iso(ms: number | null | undefined): string | null {
	return ms ? new Date(ms).toISOString() : null;
}

export function billingFromCustomer(
	customer: Pick<AutumnCustomer, "flags" | "subscriptions" | "invoices">,
	now: number,
): OrganizationBilling {
	const tier = tierFromFlags(customer.flags);
	const paidPlanId = paidPlanIdFromFlags(customer.flags);
	const paid = paidPlanId
		? customer.subscriptions.find(
				(subscription) => subscription.planId === paidPlanId,
			)
		: undefined;
	const unpaidInvoice = (customer.invoices ?? [])
		.filter((invoice) => UNPAID_INVOICE.has(invoice.status))
		.sort((a, b) => b.createdAt - a.createdAt)[0];
	const status = !paid
		? tier === "free"
			? null
			: "active"
		: paid.pastDue
			? "past_due"
			: paid.trialEndsAt && paid.trialEndsAt > now
				? "trialing"
				: "active";
	const lapsed = tier === "free" && unpaidInvoice !== undefined;
	const paymentState: PaymentState =
		status === "past_due"
			? {
					kind: "past_due",
					amountDue: unpaidInvoice?.total ?? null,
					currency: unpaidInvoice?.currency ?? null,
					hostedInvoiceUrl: unpaidInvoice?.hostedInvoiceUrl ?? null,
				}
			: lapsed
				? {
						kind: "ended_unpaid",
						amountDue: unpaidInvoice?.total ?? null,
						currency: unpaidInvoice?.currency ?? null,
					}
				: { kind: "ok" };
	return {
		tier,
		status,
		cancelAt: iso(paid?.expiresAt),
		periodStart: iso(paid?.currentPeriodStart),
		periodEnd: iso(paid?.currentPeriodEnd),
		billingInterval:
			paid?.plan?.price?.interval ??
			paid?.plan?.items.find((item) => item.featureId === SEATS_FEATURE_ID)
				?.price?.interval ??
			null,
		lapsed,
		paymentState,
	};
}
