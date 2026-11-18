"use client";

import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "../../../ui/chart";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type { CloudUsage } from "../../types";
import { Section } from "../Section";
import { utcDays } from "./utils/utcDays";

const TICK_STEP_DAYS = 5;
/** No tick on the last bars, where its label would run past the chart's edge. */
const LAST_TICK_GAP_DAYS = 2;

interface UsageByDayProps {
	usage: CloudUsage;
	title: ReactNode;
}

export function UsageByDay({ usage, title }: UsageByDayProps) {
	const { t } = useLingui();
	const { formatCurrency, formatDate, formatNumber } = useFormat();
	const format = useUsageFormat();
	const inDollars = usage.total.usageUsd !== null;
	const byDay = new Map(usage.items.map((item) => [item.key, item]));
	const data = utcDays(usage.range).map((day) => {
		const item = byDay.get(day);
		return { day, value: (inDollars ? item?.usageUsd : item?.gbHours) ?? 0 };
	});
	const ticks = data
		.filter(
			(_, i) =>
				i % TICK_STEP_DAYS === 0 && i < data.length - LAST_TICK_GAP_DAYS,
		)
		.map((item) => item.day);
	const config = {
		value: {
			label: inDollars ? t({ message: "Usage" }) : t({ message: "GB-hours" }),
			color: "var(--muted-foreground)",
		},
	} satisfies ChartConfig;
	const formatDay = (day: string) =>
		formatDate(new Date(`${day}T00:00:00Z`), {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		});
	const formatValue = (value: number) =>
		inDollars ? format.dollars(value) : format.formatGbHours(value);

	return (
		<Section title={title}>
			<ChartContainer config={config} className="aspect-auto h-44 w-full">
				<BarChart data={data} margin={{ left: 0, right: 0, top: 4 }}>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="day"
						tickLine={false}
						axisLine={false}
						ticks={ticks}
						interval={0}
						tickFormatter={formatDay}
					/>
					<YAxis
						width={48}
						tickLine={false}
						axisLine={false}
						tickFormatter={(value: number) =>
							inDollars
								? formatCurrency(value, "USD", {
										minimumFractionDigits: 0,
										maximumFractionDigits: 0,
									})
								: formatNumber(value)
						}
					/>
					<ChartTooltip
						content={
							<ChartTooltipContent
								labelFormatter={(_, payload) =>
									formatDay(payload[0]?.payload.day)
								}
								formatter={(value) => formatValue(Number(value))}
							/>
						}
					/>
					<Bar dataKey="value" fill="var(--color-value)" radius={2} />
				</BarChart>
			</ChartContainer>
		</Section>
	);
}
