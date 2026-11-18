"use client";

import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type { CloudPeriod } from "../../types";
import type { PricedAllowance, PricedMetrics } from "../../utils/priced";
import { AllowanceLines } from "./components/AllowanceLines";
import { allowanceLines } from "./utils/allowanceLines";

type Reason = CloudPeriod["unavailable"][number]["reason"];

interface AllowanceCardProps {
	total: PricedMetrics;
	/** Undefined when the organization has no billing periods and the range is the last 30 days. */
	period: CloudPeriod | undefined;
	/** The period's allowance; null for a closed period. */
	allowance: PricedAllowance | null;
	billing: ReactNode;
}

/** What the card says, once per reason, about a value the router could not give. A member never sees the card. */
const NOTES: Record<Exclude<Reason, "owners_and_admins_only">, ReactNode> = {
	closed_period: (
		<Trans>The breakdown by plan is kept for the current period only.</Trans>
	),
	not_read: (
		<Trans>
			Seats, credits and the extra-usage limit are not loaded yet. They show
			after billing data next refreshes.
		</Trans>
	),
	percent_of_allowance: (
		<Trans>
			The extra-usage limit is a percentage of the plan, so its amount is not
			shown.
		</Trans>
	),
	not_tracked: (
		<Trans>This page cannot tell when the usage limit is reached.</Trans>
	),
};

export function AllowanceCard({
	total,
	period,
	allowance,
	billing,
}: AllowanceCardProps) {
	const { dollarsFor } = useUsageFormat();
	const summary =
		allowance?.includedGbHours != null && allowance.includedUsd !== null
			? allowanceLines(
					allowance,
					{ gbHours: allowance.includedGbHours, usd: allowance.includedUsd },
					{ gbHours: total.gbHours, usd: total.usageUsd },
					period?.unavailable
						.filter((item) => item.reason === "not_read")
						.map((item) => item.field),
				)
			: null;
	const dollars = dollarsFor([
		total.usageUsd,
		...(summary
			? [
					summary.used.usd,
					summary.cap.usd,
					...summary.lines.flatMap((line) => [
						line.used.usd,
						...(line.total ? [line.total.usd] : []),
					]),
				]
			: []),
	]);
	const used = dollars(summary ? summary.used.usd : total.usageUsd);
	const cap = summary && dollars(summary.cap.usd);
	const reasons = new Set(period?.unavailable.map((item) => item.reason));
	const notes = (Object.keys(NOTES) as (keyof typeof NOTES)[]).filter(
		(reason) => reasons.has(reason),
	);

	return (
		<section className="space-y-3 rounded-lg bg-muted/60 p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h3 className="text-base tabular-nums">
					<span className="font-semibold">
						<Trans>{used} used</Trans>
					</span>{" "}
					<span className="text-muted-foreground">
						{summary?.hasCap ? (
							<Trans>of {cap} limit</Trans>
						) : summary ? (
							<Trans>of {cap} included</Trans>
						) : period ? (
							<Trans>in this period</Trans>
						) : (
							<Trans>in the last 30 days</Trans>
						)}
					</span>
				</h3>
				{billing}
			</div>
			{summary && allowance && (
				<AllowanceLines
					lines={summary.lines}
					scale={summary.scale}
					seats={allowance.seats}
					format={dollars}
				/>
			)}
			{notes.map((reason) => (
				<p key={reason} className="text-xs text-muted-foreground">
					{NOTES[reason]}
				</p>
			))}
		</section>
	);
}
