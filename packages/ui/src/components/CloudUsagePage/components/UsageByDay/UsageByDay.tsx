"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { cn } from "../../../../lib/utils";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "../../../ui/chart";
import type { CloudUsage as Usage } from "../../types";
import { utcDays } from "./utils/utcDays";

interface UsageByDayProps {
	items: Usage["items"];
	window: Usage["range"];
	title: ReactNode;
	className?: string;
}

export function UsageByDay({
	items,
	window,
	title,
	className,
}: UsageByDayProps) {
	const { t } = useLingui();
	const { formatDate, formatNumber } = useFormat();
	const gbHoursByDay = new Map(items.map((item) => [item.key, item.gbHours]));
	const data = utcDays(window).map((day) => ({
		day,
		gbHours: gbHoursByDay.get(day) ?? 0,
	}));
	const config = {
		gbHours: { label: t({ message: "GB-hours" }), color: "var(--chart-1)" },
	} satisfies ChartConfig;
	const formatDay = (day: string) =>
		formatDate(new Date(`${day}T00:00:00Z`), {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		});

	return (
		<section className={cn("min-w-0 space-y-3", className)}>
			<h3 className="text-sm font-medium">{title}</h3>
			<ChartContainer config={config} className="aspect-auto h-48 w-full">
				<BarChart data={data} margin={{ left: 0, right: 0, top: 4 }}>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="day"
						tickLine={false}
						axisLine={false}
						minTickGap={24}
						tickFormatter={formatDay}
					/>
					<YAxis
						width={40}
						tickLine={false}
						axisLine={false}
						tickFormatter={(value: number) => formatNumber(value)}
					/>
					<ChartTooltip
						content={
							<ChartTooltipContent
								labelFormatter={(_, payload) =>
									formatDay(payload[0]?.payload.day)
								}
							/>
						}
					/>
					<Bar dataKey="gbHours" fill="var(--color-gbHours)" radius={2} />
				</BarChart>
			</ChartContainer>
			<p className="text-xs text-muted-foreground">
				<Trans>
					Usage is shown on the UTC day it was billed, which can be a little
					after the workspace ran.
				</Trans>
			</p>
		</section>
	);
}
