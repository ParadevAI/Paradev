"use client";

import { Trans } from "@lingui/react/macro";
import { cloudUsageDisplay } from "@superset/shared/cloud-usage-display";
import type { ReactNode } from "react";
import { Badge } from "../../../ui/badge";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "../../../ui/card";
import { Progress } from "../../../ui/progress";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type { CloudPeriod } from "../../types";
import type { PricedAllowance, PricedMetrics } from "../../utils/priced";
import { AllowanceLines } from "./components/AllowanceLines";

interface AllowanceCardProps {
	total: PricedMetrics;
	/** Undefined when the organization has no billing periods and the range is the last 30 days. */
	period: CloudPeriod | undefined;
	/** The period's allowance; null for a closed period. */
	allowance: PricedAllowance | null;
	billing: ReactNode;
}

export function AllowanceCard({
	total,
	period,
	allowance,
	billing,
}: AllowanceCardProps) {
	const { dollarsFor } = useUsageFormat();
	const notRead = period?.unavailable.some(
		(item) => item.reason === "not_read",
	);
	const shown = cloudUsageDisplay(notRead ? null : allowance, {
		gbHours: total.gbHours,
		usd: total.usageUsd,
	});
	const dollars = dollarsFor([
		shown.used.usd,
		...(shown.held ? [shown.held.usd] : []),
		...(shown.over ? [shown.over.usd] : []),
		...shown.lines.flatMap((line) => [line.used.usd, line.total.usd]),
	]);
	const used = dollars(shown.used.usd);
	const held = shown.held && dollars(shown.held.usd);
	const over = shown.over && dollars(shown.over.usd);

	return (
		<Card className="gap-4 py-5">
			<CardHeader className="items-center px-5">
				<CardTitle
					role="heading"
					aria-level={3}
					className="flex flex-wrap items-baseline gap-x-1.5 text-base font-normal tabular-nums"
				>
					<span className="font-semibold">
						<Trans>{used} used</Trans>
					</span>
					<span className="text-muted-foreground">
						{held ? (
							<Trans>of {held}</Trans>
						) : period ? (
							<Trans>in this period</Trans>
						) : (
							<Trans>in the last 30 days</Trans>
						)}
					</span>
					{over && (
						<Badge
							variant="outline"
							className="self-center border-warning/50 text-warning"
						>
							<Trans>over by {over}</Trans>
						</Badge>
					)}
				</CardTitle>
				<CardAction>{billing}</CardAction>
			</CardHeader>
			{shown.held && (
				<CardContent className="space-y-3 px-5">
					<Progress
						value={Math.min(100, (shown.used.usd / shown.held.usd) * 100 || 0)}
						aria-label={`${used} / ${held}`}
					/>
					<AllowanceLines
						lines={shown.lines}
						seats={allowance?.seats ?? null}
						format={dollars}
					/>
				</CardContent>
			)}
		</Card>
	);
}
