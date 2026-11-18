import type { GbHourPack } from "@superset/shared/billing";
import type { getAutumnCustomer } from "./customer";
import { BOX_GB_MINUTES_FEATURE_ID } from "./features";

export interface CloudAutoTopup {
	enabled: boolean;
	thresholdGbMinutes: number;
	quantityGbMinutes: number;
}

/** Autumn's cap on overage: `usage_percentage` is a percent of the plan's allowance. */
type CloudOverageLimit =
	| { type: "none" }
	| { type: "absolute"; gbMinutes: number }
	| { type: "usage_percentage"; percent: number };

/** `null` in a field added after release means a cached value from before it. */
export interface CloudUsage {
	includedGbMinutes: number | null;
	usedGbMinutes: number;
	overageGbMinutes: number;
	prepaidGbMinutes: number;
	prepaidGrantedGbMinutes: number | null;
	seats: number | null;
	overageLimit: CloudOverageLimit | null;
	autoTopup: CloudAutoTopup | null;
	pack: GbHourPack | null;
	overagePerGbHour: number | null;
	resetsAt: string | null;
}

type Customer = Awaited<ReturnType<typeof getAutumnCustomer>>;

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

export function cloudUsageFromBalances(
	balances: Customer["balances"],
	billingControls?: Customer["billingControls"],
	pack: GbHourPack | null = null,
	overagePerGbHour: number | null = null,
	seats: number | null = null,
): CloudUsage | null {
	const balance = balances[BOX_GB_MINUTES_FEATURE_ID];
	if (!balance) return null;
	const breakdown = balance.breakdown ?? [];
	const prepaid = breakdown.filter(
		(item) => item.reset?.interval === "one_off",
	);
	const recurring = breakdown.filter(
		(item) => item.reset?.interval !== "one_off",
	);
	const topup = billingControls?.autoTopups?.find(
		(item) => item.featureId === BOX_GB_MINUTES_FEATURE_ID,
	);
	const overageAllowed =
		billingControls?.overageAllowed?.find(
			(item) => item.featureId === BOX_GB_MINUTES_FEATURE_ID,
		)?.enabled ?? balance.overageAllowed;
	const spendLimit = billingControls?.spendLimits?.find(
		(item) => item.featureId === BOX_GB_MINUTES_FEATURE_ID && item.enabled,
	);
	return {
		includedGbMinutes: balance.unlimited
			? null
			: breakdown.length
				? sum(recurring.map((item) => item.includedGrant))
				: balance.granted,
		usedGbMinutes: breakdown.length
			? sum(recurring.map((item) => item.usage))
			: balance.usage,
		overageGbMinutes: balance.unlimited
			? 0
			: Math.max(0, balance.usage - balance.granted),
		prepaidGbMinutes: Math.max(0, sum(prepaid.map((item) => item.remaining))),
		prepaidGrantedGbMinutes: sum(
			prepaid.map((item) => item.includedGrant + item.prepaidGrant),
		),
		seats,
		overageLimit: balance.unlimited
			? { type: "none" }
			: !overageAllowed
				? { type: "absolute", gbMinutes: 0 }
				: spendLimit?.overageLimit === undefined
					? { type: "none" }
					: spendLimit.limitType === "usage_percentage"
						? { type: "usage_percentage", percent: spendLimit.overageLimit }
						: { type: "absolute", gbMinutes: spendLimit.overageLimit },
		autoTopup: topup
			? {
					enabled: topup.enabled,
					thresholdGbMinutes: topup.threshold,
					quantityGbMinutes: topup.quantity,
				}
			: null,
		pack,
		overagePerGbHour,
		resetsAt: balance.nextResetAt
			? new Date(balance.nextResetAt).toISOString()
			: null,
	};
}
