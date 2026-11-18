"use client";

import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type { CloudMetrics, CloudPeriod } from "../../types";
import { AllowanceLines } from "./components/AllowanceLines";

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
	const { usage, gbHours } = useUsageFormat();
	const used = usage(total);
	const included = allowance?.includedGbHours ?? null;
	const includedLabel = included === null ? null : gbHours(included);

	return (
		<section className="space-y-3 rounded-lg bg-muted/60 p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h3 className="text-base tabular-nums">
					<span className="font-semibold">
						<Trans>{used} used</Trans>
					</span>{" "}
					<span className="text-muted-foreground">
						{includedLabel !== null ? (
							<Trans>of {includedLabel} included</Trans>
						) : isPeriod ? (
							<Trans>in this period</Trans>
						) : (
							<Trans>in the last 30 days</Trans>
						)}
					</span>
				</h3>
				{billing}
			</div>
			{allowance && included !== null ? (
				<AllowanceLines allowance={allowance} included={included} />
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
