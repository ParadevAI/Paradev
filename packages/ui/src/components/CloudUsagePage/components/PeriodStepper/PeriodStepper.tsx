"use client";

import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { Button } from "../../../ui/button";
import { usePeriodLabel } from "../../hooks/usePeriodLabel";
import type { CloudPeriod, CloudUsageLink } from "../../types";

interface PeriodStepperProps {
	Link: CloudUsageLink;
	/** Newest first. */
	periods: CloudPeriod[];
	period: CloudPeriod;
}

export function PeriodStepper({ Link, periods, period }: PeriodStepperProps) {
	const { t } = useLingui();
	const label = usePeriodLabel();
	const index = periods.indexOf(period);
	const step = (offset: number, name: string, icon: ReactNode) => {
		const target = periods[index + offset];
		if (!target) {
			return (
				<Button variant="outline" size="icon-sm" disabled aria-label={name}>
					{icon}
				</Button>
			);
		}
		return (
			<Button variant="outline" size="icon-sm" asChild>
				<Link
					to={{
						page: "overview",
						period: index + offset === 0 ? undefined : target.id,
					}}
					aria-label={name}
				>
					{icon}
				</Link>
			</Button>
		);
	};

	return (
		<div className="flex items-center gap-1.5">
			{step(1, t({ message: "Earlier period" }), <LuChevronLeft />)}
			<span className="min-w-32 text-center text-sm font-semibold tabular-nums">
				{label(period)}
			</span>
			{step(-1, t({ message: "Later period" }), <LuChevronRight />)}
		</div>
	);
}
