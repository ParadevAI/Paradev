"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Area, AreaChart } from "recharts";
import { type ChartConfig, ChartContainer } from "../../../ui/chart";
import { Progress } from "../../../ui/progress";
import { Table, TableBody, TableCell, TableRow } from "../../../ui/table";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type { CloudQuery, CloudUsageLink } from "../../types";
import type { PricedUsage } from "../../utils/priced";
import { Person } from "../Person";
import { QueryStatus } from "../QueryStatus";
import { Section } from "../Section";
import { utcDays } from "../UsageByDay/utils/utcDays";

interface UsageByPersonProps {
	Link: CloudUsageLink;
	byPerson: CloudQuery<PricedUsage>;
	/** Each person's usage by day, for the sparklines. */
	byPersonDays: CloudQuery<PricedUsage>;
	period: string | undefined;
}

export function UsageByPerson({
	Link,
	byPerson,
	byPersonDays,
	period,
}: UsageByPersonProps) {
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const { dollars } = useUsageFormat();
	const items = byPerson.data?.items ?? [];
	const total = byPerson.data?.total.usageUsd ?? 0;
	const days = byPerson.data ? utcDays(byPerson.data.range) : [];
	const usdOn = new Map(
		(byPersonDays.data?.items ?? []).map((item) => [
			`${item.key}|${item.label}`,
			item.usageUsd,
		]),
	);
	const config = {
		value: { label: t({ message: "Usage" }), color: "var(--primary)" },
	} satisfies ChartConfig;

	return (
		<Section title={<Trans>By person</Trans>}>
			{!byPerson.data ? (
				<QueryStatus
					isError={byPerson.isError}
					onRetry={() => byPerson.refetch()}
				/>
			) : (
				<Table>
					<TableBody>
						{items.map((item) => {
							const share = total > 0 ? item.usageUsd / total : 0;
							const name = item.ref?.name;
							return (
								<TableRow key={item.key ?? ""}>
									<TableCell className="max-w-48">
										{name && item.key ? (
											<Link
												to={{ view: "workspaces", period, user: item.key }}
												className="block min-w-0"
											>
												<Person name={name} />
											</Link>
										) : (
											<span className="text-muted-foreground">
												<Trans>No person recorded</Trans>
											</span>
										)}
									</TableCell>
									<TableCell className="w-28">
										{days.some((day) => usdOn.has(`${item.key}|${day}`)) && (
											<ChartContainer
												config={config}
												className="aspect-auto h-6 w-24"
											>
												<AreaChart
													data={days.map((day) => ({
														day,
														value: usdOn.get(`${item.key}|${day}`) ?? 0,
													}))}
													margin={{ top: 1, bottom: 1, left: 0, right: 0 }}
												>
													<Area
														dataKey="value"
														type="monotone"
														stroke="var(--color-value)"
														fill="var(--color-value)"
														fillOpacity={0.15}
														strokeWidth={1.5}
														isAnimationActive={false}
													/>
												</AreaChart>
											</ChartContainer>
										)}
									</TableCell>
									<TableCell className="w-40">
										<span className="flex items-center gap-2">
											<Progress value={share * 100} className="h-1.5" />
											<span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
												{formatNumber(share, {
													style: "percent",
													maximumFractionDigits: 0,
												})}
											</span>
										</span>
									</TableCell>
									<TableCell className="w-24 text-right tabular-nums">
										{dollars(item.usageUsd)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			)}
		</Section>
	);
}
