import {
	gbHourPack,
	type MachineSize,
	overagePerGbHour,
	PLAN_METADATA,
	type PlanTier,
} from "@superset/shared/billing";
import { type CloudUsage, cloudUsageFromBalances } from "./cloud-usage";
import type { getAutumnCustomer } from "./customer";
import {
	gatedMachineSizesFromFlags,
	paidPlanIdFromFlags,
	tierFromFlags,
} from "./entitlements";
import {
	type EnvironmentLimit,
	environmentLimitFromBalances,
} from "./environment-limit";
import { SEATS_FEATURE_ID } from "./features";
import { seatRenewal } from "./seat-policy";

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
	autumnPlanId: string | null;
	status: "active" | "trialing" | "past_due" | null;
	trialEnd?: string | null;
	seatsBilled?: number | null;
	cancelAt: string | null;
	scheduledPlanId: string | null;
	scheduledAt: string | null;
	periodStart: string | null;
	periodEnd: string | null;
	/** Autumn anchors the monthly GB-minute reset on it. */
	startedAt: string | null;
	billingInterval: string | null;
	lapsed: boolean;
	paymentState: PaymentState;
	cloudUsage: CloudUsage | null;
	planTier: string;
	gatedMachineSizes: MachineSize[];
	environmentLimit: EnvironmentLimit;
}

type AutumnCustomer = Awaited<ReturnType<typeof getAutumnCustomer>>;

const UNPAID_INVOICE = new Set(["open", "uncollectible"]);

/** The plan's family in Autumn (pro, team, ultra), else the entitlement tier. */
function planTierOf(
	metadata: Record<string, unknown> | undefined,
	tier: PlanTier,
): string {
	const family = metadata?.[PLAN_METADATA.family];
	return typeof family === "string" && family ? family : tier;
}

/** The paid plan's seat licenses, else the seats feature of a plan from before licenses. */
function seatCount(
	customer: Pick<AutumnCustomer, "balances" | "licenses">,
	planId: string | null,
): number | null {
	const licenses = (customer.licenses ?? []).filter(
		(license) => license.parentPlanId === planId,
	);
	return licenses.length
		? licenses.reduce((total, license) => total + license.granted, 0)
		: (customer.balances[SEATS_FEATURE_ID]?.granted ?? null);
}

function iso(ms: number | null | undefined): string | null {
	return ms ? new Date(ms).toISOString() : null;
}

export function billingFromCustomer(
	customer: Pick<
		AutumnCustomer,
		| "flags"
		| "subscriptions"
		| "invoices"
		| "balances"
		| "billingControls"
		| "licenses"
	>,
	now: number,
	seatInterval: string | null = null,
): OrganizationBilling {
	const tier = tierFromFlags(customer.flags);
	const paidPlanId = paidPlanIdFromFlags(customer.flags);
	const paid = paidPlanId
		? customer.subscriptions.find(
				(subscription) =>
					subscription.planId === paidPlanId &&
					subscription.status !== "scheduled",
			)
		: undefined;
	const next = customer.subscriptions.find(
		(subscription) => subscription.status === "scheduled",
	);
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
	const pack = paid?.plan ? gbHourPack(paid.plan) : null;
	return {
		tier,
		autumnPlanId: paidPlanId,
		status,
		trialEnd: iso(paid?.trialEndsAt),
		seatsBilled: seatCount(customer, paidPlanId),
		cancelAt: next ? null : iso(paid?.expiresAt),
		scheduledPlanId: next && next.planId !== paidPlanId ? next.planId : null,
		scheduledAt:
			next && next.planId !== paidPlanId ? iso(next.startedAt) : null,
		periodStart: iso(paid?.currentPeriodStart),
		startedAt: iso(paid?.startedAt),
		periodEnd: iso(
			seatRenewal({
				startedAt: paid?.startedAt,
				currentPeriodEnd: paid?.currentPeriodEnd,
				seatInterval,
				now,
			}),
		),
		billingInterval:
			paid?.plan?.price?.interval ??
			paid?.plan?.items.find((item) => item.featureId === SEATS_FEATURE_ID)
				?.price?.interval ??
			seatInterval,
		lapsed,
		paymentState,
		cloudUsage: cloudUsageFromBalances(
			customer.balances,
			customer.billingControls,
			pack,
			(paid?.plan && overagePerGbHour(paid.plan)) ??
				(pack && (pack.price * 60) / pack.gbMinutes),
			seatCount(customer, paidPlanId),
		),
		planTier: planTierOf(paid?.plan?.metadata, tier),
		gatedMachineSizes: gatedMachineSizesFromFlags(customer.flags),
		environmentLimit:
			environmentLimitFromBalances(customer.balances) ??
			(tier === "free" ? 0 : null),
	};
}
