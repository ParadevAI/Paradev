"use client";

import { Plural, Trans } from "@lingui/react/macro";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type { PricedMetrics } from "../../utils/priced";

export function MemberSummary({
	total,
	isPeriod,
}: {
	total: PricedMetrics;
	isPeriod: boolean;
}) {
	const { dollars } = useUsageFormat();
	const used = dollars(total.usageUsd);
	const count = total.workspaces;

	return (
		<section className="space-y-1.5 rounded-lg bg-muted/60 p-4">
			<h3 className="text-base tabular-nums">
				<span className="font-semibold">
					<Trans>{used} used by you</Trans>
				</span>{" "}
				<span className="text-muted-foreground">
					{isPeriod ? (
						<Plural
							value={count}
							one="in # workspace this period"
							other="in # workspaces this period"
						/>
					) : (
						<Plural
							value={count}
							one="in # workspace in the last 30 days"
							other="in # workspaces in the last 30 days"
						/>
					)}
				</span>
			</h3>
			<p className="text-xs text-muted-foreground">
				<Trans>
					Your own usage only. The organization's totals, its allowance and
					usage by person are for owners and admins.
				</Trans>
			</p>
		</section>
	);
}
