"use client";

import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { RouterOutputs } from "@superset/trpc";
import { Progress } from "@superset/ui/progress";
import { useFormatGbHours } from "../../../../../hooks/useFormatGbHours";

type Allowance = NonNullable<
	RouterOutputs["cloud"]["periods"]["list"]["items"][number]["allowance"]
>;

export function AllowanceCard({ allowance }: { allowance: Allowance }) {
	const { formatDate } = useFormat();
	const formatGbHours = useFormatGbHours();
	const { includedGbHours, usedGbHours, overageGbHours } = allowance;
	const used = formatGbHours(usedGbHours);
	const included = includedGbHours ? formatGbHours(includedGbHours) : null;
	const overage = formatGbHours(overageGbHours);
	const prepaid = formatGbHours(allowance.prepaidRemainingGbHours);
	const resetDate = formatDate(allowance.resetsAt);

	return (
		<section className="space-y-3 rounded-md border p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<div className="text-sm font-medium tabular-nums">
					{included === null ? (
						<Trans>GB-hours used: {used}</Trans>
					) : (
						<Trans>
							GB-hours used: {used} of {included}
						</Trans>
					)}
				</div>
				<div className="text-sm text-muted-foreground">
					<Trans>Resets {resetDate}</Trans>
				</div>
			</div>
			{includedGbHours !== null && includedGbHours > 0 && (
				<Progress
					value={Math.min(100, (usedGbHours / includedGbHours) * 100)}
				/>
			)}
			{includedGbHours === 0 && (
				<p className="text-sm text-muted-foreground">
					<Trans>Your plan includes no cloud GB-hours.</Trans>
				</p>
			)}
			{allowance.prepaidRemainingGbHours > 0 && (
				<p className="text-sm text-muted-foreground tabular-nums">
					<Trans>Bought GB-hours left: {prepaid}</Trans>
				</p>
			)}
			{overageGbHours > 0 && (
				<p className="text-sm text-warning tabular-nums">
					<Trans>GB-hours over the plan: {overage}</Trans>
				</p>
			)}
		</section>
	);
}
