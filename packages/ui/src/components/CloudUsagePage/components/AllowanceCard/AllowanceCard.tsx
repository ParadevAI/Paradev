"use client";

import { Trans } from "@lingui/react/macro";
import {
	type Amount,
	type CloudAllowance,
	cloudUsageDisplay,
} from "@superset/shared/cloud-usage-display";
import type { ReactNode } from "react";
import { cn } from "../../../../lib/utils";
import { Badge } from "../../../ui/badge";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "../../../ui/card";
import { BOX } from "../../constants";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import { AllowanceLines } from "./components/AllowanceLines";
import { SEGMENT_COLORS } from "./constants";

interface AllowanceCardProps {
	/** Our own count of the range's usage, shown when billing gives no breakdown. */
	metered: Amount;
	/** Null for a past period. */
	allowance: CloudAllowance | null;
	/** What billing could not give; a `not_read` entry means no breakdown yet. */
	unavailable: readonly { reason: string }[];
	/** False for the last 30 days of an organization with no billing periods. */
	isPeriod: boolean;
	billing: ReactNode;
	seats: number | null;
}

export function AllowanceCard({
	metered,
	allowance,
	unavailable,
	isPeriod,
	billing,
	seats,
}: AllowanceCardProps) {
	const { dollarsFor } = useUsageFormat();
	const shown = cloudUsageDisplay(
		unavailable.some((item) => item.reason === "not_read") ? null : allowance,
		metered,
	);
	const dollars = dollarsFor([
		shown.used.usd,
		...(shown.held ? [shown.held.usd] : []),
		...(shown.over ? [shown.over.usd] : []),
		...shown.lines.flatMap((line) => [line.used.usd, line.total.usd]),
	]);
	const used = dollars(shown.used.usd);
	const held = shown.held && dollars(shown.held.usd);
	const over = shown.over && dollars(shown.over.usd);
	const segments = [
		...shown.lines.map((line) => ({ kind: line.kind, usd: line.used.usd })),
		...(shown.over ? [{ kind: "over" as const, usd: shown.over.usd }] : []),
	];
	const scale = Math.max(shown.held?.usd ?? 0, shown.used.usd) || 1;

	return (
		<Card className={cn("gap-4 py-5", BOX)}>
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
						) : isPeriod ? (
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
					<div
						role="img"
						aria-label={`${used} / ${held}`}
						className="flex h-2.5 overflow-hidden rounded-full bg-foreground/15"
					>
						{segments.map((segment) => (
							<span
								key={segment.kind}
								className={SEGMENT_COLORS[segment.kind]}
								style={{ width: `${(segment.usd / scale) * 100}%` }}
							/>
						))}
					</div>
					<AllowanceLines lines={shown.lines} seats={seats} format={dollars} />
				</CardContent>
			)}
		</Card>
	);
}
