"use client";

import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { cn } from "../../../../../../lib/utils";
import { useUsageFormat } from "../../../../hooks/useUsageFormat";
import type { CloudPeriod } from "../../../../types";

interface AllowanceLinesProps {
	allowance: NonNullable<CloudPeriod["allowance"]>;
	included: number;
}

const SWATCH = {
	included: "bg-foreground/70",
	bought: "bg-chart-2",
	over: "bg-chart-1",
};

export function AllowanceLines({ allowance, included }: AllowanceLinesProps) {
	const { gbHours, formatGbHours } = useUsageFormat();
	const { usedGbHours, overageGbHours, prepaidRemainingGbHours } = allowance;
	const includedUsed = Math.min(usedGbHours, included);
	const scale = included + overageGbHours + prepaidRemainingGbHours;
	const includedUsedLabel = formatGbHours(includedUsed);
	const includedLabel = gbHours(included);
	const boughtLabel = gbHours(prepaidRemainingGbHours);
	const overLabel = gbHours(overageGbHours);
	const hasPaid = overageGbHours > 0 || prepaidRemainingGbHours > 0;

	const line = (swatch: string, label: ReactNode, value: ReactNode) => (
		<tr className="border-b border-border/70">
			<td className="py-2">
				<span className="inline-flex items-center gap-2">
					<span
						aria-hidden
						className={cn("size-2.5 shrink-0 rounded-[2px]", swatch)}
					/>
					{label}
				</span>
			</td>
			<td className="py-2 pl-3 text-right tabular-nums">{value}</td>
		</tr>
	);
	const group = (label: ReactNode) => (
		<tr>
			<td
				colSpan={2}
				className="pt-3 pb-1 text-xs tracking-wide text-muted-foreground uppercase"
			>
				{label}
			</td>
		</tr>
	);

	return (
		<>
			{scale > 0 && (
				<div className="flex h-2 overflow-hidden rounded-full bg-foreground/10">
					<span
						className={SWATCH.included}
						style={{ width: `${(includedUsed / scale) * 100}%` }}
					/>
					<span
						className={SWATCH.over}
						style={{ width: `${(overageGbHours / scale) * 100}%` }}
					/>
				</div>
			)}
			{/* Dollars per line, the seat count, free credits and the extra-usage limit wait for the router's allowance fields. */}
			<table className="w-full text-sm">
				<tbody>
					{group(<Trans context="cloud allowance group">Free</Trans>)}
					{line(
						SWATCH.included,
						<Trans>Included with the plan</Trans>,
						included === 0 ? (
							<Trans>None</Trans>
						) : (
							<Trans>
								{includedUsedLabel} of {includedLabel}
							</Trans>
						),
					)}
					{hasPaid &&
						group(<Trans context="cloud allowance group">Paid</Trans>)}
					{prepaidRemainingGbHours > 0 &&
						line(
							SWATCH.bought,
							<Trans>Bought GB-hours</Trans>,
							<Trans>{boughtLabel} left</Trans>,
						)}
					{overageGbHours > 0 &&
						line(SWATCH.over, <Trans>Over the plan</Trans>, overLabel)}
				</tbody>
			</table>
		</>
	);
}
