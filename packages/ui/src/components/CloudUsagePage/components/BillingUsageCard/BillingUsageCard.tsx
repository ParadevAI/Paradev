"use client";

import {
	allowanceOf,
	type BillingCloudUsage,
} from "@superset/shared/cloud-usage-display";
import type { ReactNode } from "react";
import { priced } from "../../utils/priced";
import { AllowanceCard } from "../AllowanceCard";

interface BillingUsageCardProps {
	/** `billing.cloudUsage`: null for a member, who sees no cloud card. */
	usage:
		| (BillingCloudUsage & {
				resetsAt: string | null;
				overagePerGbHour: number | null;
		  })
		| null
		| undefined;
	/** The link to the cloud usage page, when the organization has it. */
	link: ReactNode;
}

/** The cloud usage page's allowance card, on Billing settings. */
export function BillingUsageCard({ usage, link }: BillingUsageCardProps) {
	if (
		!usage?.resetsAt ||
		(!usage.includedGbMinutes &&
			!usage.usedGbMinutes &&
			!usage.prepaidGbMinutes)
	) {
		return null;
	}
	const { allowance, unavailable } = allowanceOf(
		usage,
		new Date(usage.resetsAt),
		usage.overagePerGbHour,
	);
	const shown = priced(allowance);
	if (!shown) return null;
	return (
		<AllowanceCard
			metered={{ gbHours: shown.usedGbHours, usd: shown.usedUsd }}
			allowance={
				unavailable.some((item) => item.reason === "not_read") ? null : shown
			}
			isPeriod
			seats={shown.seats}
			billing={link}
		/>
	);
}
