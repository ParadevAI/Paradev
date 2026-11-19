"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Area, AreaChart } from "recharts";
import { cn } from "../../../../lib/utils";
import { type ChartConfig, ChartContainer } from "../../../ui/chart";
import { Progress } from "../../../ui/progress";
import { Table, TableBody, TableCell, TableRow } from "../../../ui/table";
import { CHART_BAR } from "../../constants";
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
	period: string | undefined;
}

export function UsageByPerson({ Link, byPerson, period }: UsageByPersonProps) {
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const { dollars, formatGbHours } = useUsageFormat();
	const items = byPerson.data?.items ?? [];
	const total = byPerson.data?.total.usageUsd ?? 0;
	const days = byPerson.data ? utcDays(byPerson.data.range) : [];
	const config = {
		value: { label: t({ message: "Usage" }), color: CHART_BAR.color },
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
							const person =
								item.ref && !("status" in item.ref) ? item.ref : null;
							const usdOn = new Map(
								(item.days ?? []).map((day) => [day.day, day.usageUsd]),
							);
							const gbHours = (
								<Trans>{formatGbHours(item.gbHours)} GB-hours</Trans>
							);
							return (
								<TableRow key={item.key ?? ""} className="relative">
									<TableCell className="whitespace-normal">
										{person ? (
											<Link
												to={{ view: "workspaces", period, user: person.id }}
												className="block min-w-0 after:absolute after:inset-0"
											>
												<Person name={person.name} image={person.image} />
											</Link>
										) : (
											<span className="text-muted-foreground">
												<Trans>No person recorded</Trans>
											</span>
										)}
										<div className="pl-6 text-xs text-muted-foreground tabular-nums @2xl:hidden">
											{gbHours}
										</div>
									</TableCell>
									<TableCell className="hidden w-16 @md:table-cell @3xl:w-28">
										{usdOn.size > 0 && (
											<ChartContainer
												config={config}
												className={cn(
													"aspect-auto h-6 w-14 @3xl:w-24",
													CHART_BAR.className,
												)}
											>
												<AreaChart
													data={days.map((day) => ({
														day,
														value: usdOn.get(day) ?? 0,
													}))}
													margin={{ top: 1, bottom: 1, left: 0, right: 0 }}
												>
													<Area
														dataKey="value"
														type="monotone"
														stroke="var(--color-value)"
														fill="var(--color-value)"
														fillOpacity={0.2}
														strokeWidth={1.5}
														isAnimationActive={false}
													/>
												</AreaChart>
											</ChartContainer>
										)}
									</TableCell>
									<TableCell className="hidden w-28 text-right text-muted-foreground tabular-nums @2xl:table-cell">
										{gbHours}
									</TableCell>
									<TableCell className="w-12 @md:w-24 @3xl:w-40">
										<span className="flex items-center justify-end gap-2">
											<Progress
												value={share * 100}
												aria-hidden
												className="hidden h-1.5 bg-foreground/15 @md:block [&>[data-slot=progress-indicator]]:bg-foreground/60"
											/>
											<span className="w-9 shrink-0 text-right text-xs tabular-nums">
												{formatNumber(share, {
													style: "percent",
													maximumFractionDigits: 0,
												})}
											</span>
										</span>
									</TableCell>
									<TableCell className="w-16 text-right tabular-nums @2xl:w-20">
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
