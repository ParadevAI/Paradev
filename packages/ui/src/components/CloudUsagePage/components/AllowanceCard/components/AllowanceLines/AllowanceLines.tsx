"use client";

import { Plural, Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { cn } from "../../../../../../lib/utils";
import type { AllowanceLine, Amount } from "../../utils/allowanceLines";

interface AllowanceLinesProps {
	lines: AllowanceLine[];
	scale: Amount;
	seats: number | null;
	format: (usd: number) => string;
}

const SWATCH: Record<AllowanceLine["kind"], string> = {
	included: "bg-foreground/70",
	freeCredits: "bg-foreground/35",
	bought: "bg-chart-2",
	extra: "bg-chart-1",
	beyond: "bg-warning",
};

export function AllowanceLines({
	lines,
	scale,
	seats,
	format,
}: AllowanceLinesProps) {
	const share = (amount: Amount) => {
		return scale.usd > 0 ? (amount.usd / scale.usd) * 100 : 0;
	};
	const label = (line: AllowanceLine): ReactNode => {
		switch (line.kind) {
			case "included":
				return seats === null ? (
					<Trans>Included with the plan</Trans>
				) : (
					<Plural
						value={seats}
						one="Included with # seat"
						other="Included with # seats"
					/>
				);
			case "freeCredits":
				return <Trans>Free credits</Trans>;
			case "bought":
				return <Trans>Bought credits</Trans>;
			case "extra":
				return <Trans>Extra usage</Trans>;
			case "beyond":
				return <Trans>Beyond the included total</Trans>;
		}
	};
	const value = (line: AllowanceLine) => {
		const used = format(line.used.usd);
		if (!line.total) return used;
		const total = format(line.total.usd);
		return (
			<Trans>
				{used} of {total}
			</Trans>
		);
	};
	const row = (line: AllowanceLine) => (
		<tr key={line.kind} className="border-b border-border/70">
			<td className="py-2">
				<span className="inline-flex items-center gap-2">
					<span
						aria-hidden
						className={cn("size-2.5 shrink-0 rounded-[2px]", SWATCH[line.kind])}
					/>
					{label(line)}
				</span>
			</td>
			<td className="py-2 pl-3 text-right tabular-nums">{value(line)}</td>
		</tr>
	);
	const group = (heading: ReactNode, items: AllowanceLine[]) =>
		items.length > 0 && (
			<>
				<tr>
					<td
						colSpan={2}
						className="pt-3 pb-1 text-xs tracking-wide text-muted-foreground uppercase"
					>
						{heading}
					</td>
				</tr>
				{items.map(row)}
			</>
		);
	const billed = lines.filter((line) => line.kind !== "beyond");

	return (
		<>
			<div className="flex h-2 overflow-hidden rounded-full bg-foreground/10">
				{lines.map((line) => (
					<span
						key={line.kind}
						className={SWATCH[line.kind]}
						style={{ width: `${share(line.used)}%` }}
					/>
				))}
			</div>
			<table className="w-full text-sm">
				<tbody>
					{group(
						<Trans context="cloud allowance group">Free</Trans>,
						billed.filter((line) => !line.paid),
					)}
					{group(
						<Trans context="cloud allowance group">Paid</Trans>,
						billed.filter((line) => line.paid),
					)}
					{group(
						<Trans context="cloud allowance group">Other</Trans>,
						lines.filter((line) => line.kind === "beyond"),
					)}
				</tbody>
			</table>
		</>
	);
}
