"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { Button } from "../../../ui/button";
import { ButtonGroup, ButtonGroupText } from "../../../ui/button-group";
import { usePeriodLabel } from "../../hooks/usePeriodLabel";
import type {
	CloudPeriod,
	CloudUsageLink,
	CloudUsageTarget,
} from "../../types";

interface PeriodStepperProps {
	Link: CloudUsageLink;
	/** Newest first. */
	periods: CloudPeriod[];
	/** Undefined for the last 30 days of an organization with no billing periods. */
	period: CloudPeriod | undefined;
	/** This page for another period; undefined is the open period. */
	to: (period: string | undefined) => CloudUsageTarget;
}

/** The pages' one period control, at the top right of every page header. */
export function PeriodStepper({
	Link,
	periods,
	period,
	to,
}: PeriodStepperProps) {
	const { t } = useLingui();
	const label = usePeriodLabel();
	const index = period ? periods.indexOf(period) : -1;
	const step = (offset: number, name: string, icon: ReactNode) => {
		const target = period && periods[index + offset];
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
					to={to(index + offset === 0 ? undefined : target.id)}
					aria-label={name}
				>
					{icon}
				</Link>
			</Button>
		);
	};

	return (
		<ButtonGroup>
			{step(1, t({ message: "Earlier period" }), <LuChevronLeft />)}
			<ButtonGroupText className="min-w-32 justify-center tabular-nums">
				{period ? label(period) : <Trans>Last 30 days</Trans>}
			</ButtonGroupText>
			{step(-1, t({ message: "Later period" }), <LuChevronRight />)}
		</ButtonGroup>
	);
}
