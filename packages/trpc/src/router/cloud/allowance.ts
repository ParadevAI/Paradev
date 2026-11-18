import type { CloudUsage } from "@superset/auth/billing/cloud-usage";
import { gbMinutesUsd } from "@superset/shared/billing";
import type { CloudPeriodUnavailable } from "./schema";

function creditLine(credit: CloudUsage["bought"], rate: number | null) {
	if (!credit?.grantedGbMinutes) return null;
	const used = credit.grantedGbMinutes - credit.remainingGbMinutes;
	return {
		usedGbHours: used / 60,
		totalGbHours: credit.grantedGbMinutes / 60,
		usedUsd: gbMinutesUsd(used, rate),
		totalUsd: gbMinutesUsd(credit.grantedGbMinutes, rate),
	};
}

export function allowanceOf(
	cloudUsage: CloudUsage,
	resetsAt: Date,
	rate: number | null,
) {
	const included = cloudUsage.includedGbMinutes;
	const limit = cloudUsage.overageLimit;
	const unavailable: CloudPeriodUnavailable[] =
		cloudUsage.bought === null
			? (
					[
						"seats",
						"bought",
						"freeCredits",
						"extraUsageLimit",
						"limitReached",
					] as const
				).map((field) => ({ field, reason: "not_read" }))
			: [];
	if (limit?.type === "usage_percentage") {
		unavailable.push({
			field: "extraUsageLimit",
			reason: "percent_of_allowance",
		});
	}
	if (cloudUsage.bought !== null && cloudUsage.limitReached === null) {
		unavailable.push({ field: "limitReached", reason: "not_tracked" });
	}
	return {
		allowance: {
			includedGbHours: included === null ? null : included / 60,
			usedGbHours: cloudUsage.usedGbMinutes / 60,
			overageGbHours: cloudUsage.overageGbMinutes / 60,
			prepaidRemainingGbHours: cloudUsage.prepaidGbMinutes / 60,
			resetsAt,
			usedUsd: gbMinutesUsd(cloudUsage.usedGbMinutes, rate),
			includedUsd: included === null ? null : gbMinutesUsd(included, rate),
			overageUsd: gbMinutesUsd(cloudUsage.overageGbMinutes, rate),
			seats: cloudUsage.seats,
			bought: creditLine(cloudUsage.bought, rate),
			freeCredits: creditLine(cloudUsage.freeCredits, rate),
			extraUsageLimit:
				limit?.type === "absolute"
					? {
							gbHours: limit.gbMinutes / 60,
							usd: gbMinutesUsd(limit.gbMinutes, rate),
						}
					: null,
			limitReached: cloudUsage.limitReached,
		},
		unavailable,
	};
}
