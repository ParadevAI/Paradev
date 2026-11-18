"use client";

import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { RouterOutputs } from "@superset/trpc";
import { cn } from "@superset/ui/utils";

type Metrics = RouterOutputs["cloud"]["usage"]["query"]["total"];

interface UsageTotalsProps {
	total: Metrics;
	/** Off beside the allowance card, so one "used" figure is shown. */
	showGbHours: boolean;
}

export function UsageTotals({ total, showGbHours }: UsageTotalsProps) {
	const { formatNumber, formatGbHours } = useFormat();
	const tiles = [
		...(showGbHours
			? [
					{
						key: "gbHours",
						label: <Trans>GB-hours</Trans>,
						value: formatGbHours(total.gbHours),
					},
				]
			: []),
		{
			key: "hours",
			label: <Trans>Hours</Trans>,
			value: formatNumber(total.hours, { maximumFractionDigits: 1 }),
		},
		{
			key: "workspaces",
			label: <Trans>Workspaces</Trans>,
			value: formatNumber(total.workspaces),
		},
		{
			key: "boots",
			label: <Trans>Boots</Trans>,
			value: formatNumber(total.boots),
		},
	];

	return (
		<dl
			className={cn(
				"grid gap-px overflow-hidden rounded-md border bg-border",
				tiles.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
			)}
		>
			{tiles.map((tile) => (
				<div key={tile.key} className="bg-background p-4">
					<dt className="text-xs text-muted-foreground">{tile.label}</dt>
					<dd className="mt-1 text-lg font-medium tabular-nums">
						{tile.value}
					</dd>
				</div>
			))}
		</dl>
	);
}
