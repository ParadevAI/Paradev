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

/** One-off credit, in GB-minutes. */
interface CloudCredit {
	grantedGbMinutes: number;
	remainingGbMinutes: number;
}

/** `null` in `bought` means a cached value from before it and the fields after it. */
export interface CloudUsage {
	includedGbMinutes: number | null;
	usedGbMinutes: number;
	overageGbMinutes: number;
	prepaidGbMinutes: number;
	/** One-off rows sold at a prepaid price, with credit carried from an earlier pack. */
	bought: CloudCredit | null;
	/** One-off rows with no prepaid price: a grant. */
	freeCredits: CloudCredit | null;
	seats: number | null;
	overageLimit: CloudOverageLimit | null;
	/** Null when Autumn decides it on a rule this does not read: a percentage cap, a usage limit. */
	limitReached: boolean | null;
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
	const credit = (rows: typeof prepaid): CloudCredit => ({
		grantedGbMinutes: sum(
			rows.map((item) => item.includedGrant + item.prepaidGrant),
		),
		remainingGbMinutes: sum(rows.map((item) => item.remaining)),
	});
	const isBought = (item: (typeof prepaid)[number]) =>
		item.price?.billingMethod === "prepaid";
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
	const hasUsageLimit = billingControls?.usageLimits?.some(
		(item) => item.featureId === BOX_GB_MINUTES_FEATURE_ID && item.enabled,
	);
	const overageLimit: CloudOverageLimit = balance.unlimited
		? { type: "none" }
		: !overageAllowed
			? { type: "absolute", gbMinutes: 0 }
			: spendLimit?.overageLimit === undefined
				? { type: "none" }
				: spendLimit.limitType === "usage_percentage"
					? { type: "usage_percentage", percent: spendLimit.overageLimit }
					: { type: "absolute", gbMinutes: spendLimit.overageLimit };
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
			: breakdown.length
				? sum(
						recurring
							.filter((item) => item.price?.billingMethod === "usage_based")
							.map((item) => Math.max(0, item.usage - item.includedGrant)),
					)
				: Math.max(0, balance.usage - balance.granted),
		prepaidGbMinutes: Math.max(0, sum(prepaid.map((item) => item.remaining))),
		bought: credit(prepaid.filter(isBought)),
		freeCredits: credit(prepaid.filter((item) => !isBought(item))),
		seats,
		overageLimit,
		limitReached:
			hasUsageLimit || overageLimit.type === "usage_percentage"
				? null
				: overageLimit.type === "absolute" &&
					balance.remaining <= -overageLimit.gbMinutes,
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
