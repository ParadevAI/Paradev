"use client";

import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type { CloudMetrics, CloudPeriod } from "../../types";
import { AllowanceLines } from "./components/AllowanceLines";
import { type Amount, allowanceLines } from "./utils/allowanceLines";

interface AllowanceCardProps {
	total: CloudMetrics;
	/** Null for a past period, or when the organization has no plan data. */
	allowance: CloudPeriod["allowance"];
	/** False when the organization has no billing periods and the range is the last 30 days. */
	isPeriod: boolean;
	billing: ReactNode;
}

export function AllowanceCard({
	total,
	allowance,
	isPeriod,
	billing,
}: AllowanceCardProps) {
	const { usage, dollars, gbHours } = useUsageFormat();
	const format = (amount: Amount) =>
		amount.usd === null ? gbHours(amount.gbHours) : dollars(amount.usd);
	const used = usage(total);
	const included = allowance?.includedGbHours ?? null;
	const summary =
		allowance && included !== null ? allowanceLines(allowance, included) : null;
	const cap = summary && format(summary.cap);

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
						) : isPeriod ? (
							<Trans>in this period</Trans>
						) : (
							<Trans>in the last 30 days</Trans>
						)}
					</span>
				</h3>
				{billing}
			</div>
			{summary && allowance ? (
				<AllowanceLines
					lines={summary.lines}
					scale={summary.scale}
					seats={allowance.seats}
					format={format}
				/>
			) : (
				isPeriod && (
					<p className="text-xs text-muted-foreground">
						<Trans>
							The breakdown by plan is kept for the current period only.
						</Trans>
					</p>
				)
			)}
		</section>
	);
}
