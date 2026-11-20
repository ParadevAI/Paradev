"use client";

import type { ReactNode } from "react";
import type { CloudPeriod } from "../../types";
import { priced } from "../../utils/priced";
import { AllowanceCard } from "../AllowanceCard";

interface BillingUsageCardProps {
	/** The open period from `cloud.periods.list`; it has no allowance for a member. */
	period: CloudPeriod | undefined;
	/** `ratePerGbHour` from the same `cloud.periods.list` call. */
	ratePerGbHour: number | null;
	/** The link to the cloud usage page; absent where the organization has no such page. */
	link: ReactNode;
}

/** The cloud usage page's card on Billing settings, from the same period. */
export function BillingUsageCard({
	period,
	ratePerGbHour,
	link,
}: BillingUsageCardProps) {
	const allowance = priced(period?.allowance ?? null);
	if (!period || !allowance || period.metrics.usageUsd === null) return null;
	return (
		<AllowanceCard
			metered={{
				gbHours: period.metrics.gbHours,
				usd: period.metrics.usageUsd,
			}}
			ratePerGbHour={ratePerGbHour}
			allowance={allowance}
			unavailable={period.unavailable}
			isPeriod
			seats={allowance.seats}
			billing={link}
		/>
	);
}
