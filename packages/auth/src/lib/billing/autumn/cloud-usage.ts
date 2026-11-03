import type { GbHourPack } from "@superset/shared/billing";
import type { getAutumnCustomer } from "./customer";
import { BOX_GB_MINUTES_FEATURE_ID } from "./features";

export interface CloudAutoTopup {
	enabled: boolean;
	thresholdGbMinutes: number;
	quantityGbMinutes: number;
}

export interface CloudUsage {
	includedGbMinutes: number | null;
	usedGbMinutes: number;
	overageGbMinutes: number;
	prepaidGbMinutes: number;
	autoTopup: CloudAutoTopup | null;
	pack: GbHourPack | null;
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
		autoTopup: topup
			? {
					enabled: topup.enabled,
					thresholdGbMinutes: topup.threshold,
					quantityGbMinutes: topup.quantity,
				}
			: null,
		pack,
		resetsAt: balance.nextResetAt
			? new Date(balance.nextResetAt).toISOString()
			: null,
	};
}
