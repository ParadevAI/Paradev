"use client";

import { Plural, Trans } from "@lingui/react/macro";
import { Card, CardHeader, CardTitle } from "../../../ui/card";
import { BOX } from "../../constants";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type { PricedMetrics } from "../../utils/priced";

export function MemberSummary({
	total,
	workspaces: count,
	isPeriod,
}: {
	total: PricedMetrics;
	/** Null until the workspaces are counted. */
	workspaces: number | null;
	isPeriod: boolean;
}) {
	const { dollars } = useUsageFormat();
	const used = dollars(total.usageUsd);

	return (
		<Card className={BOX}>
			<CardHeader>
				<CardTitle
					role="heading"
					aria-level={3}
					className="text-base font-normal tabular-nums"
				>
					<span className="font-semibold">
						<Trans>{used} used by you</Trans>
					</span>{" "}
					{count !== null && (
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
					)}
				</CardTitle>
			</CardHeader>
		</Card>
	);
}
