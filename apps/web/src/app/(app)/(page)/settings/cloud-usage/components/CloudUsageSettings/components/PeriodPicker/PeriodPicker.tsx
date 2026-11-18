"use client";

import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { RouterOutputs } from "@superset/trpc";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";

type Period = RouterOutputs["cloud"]["periods"]["list"]["items"][number];

interface PeriodPickerProps {
	periods: Period[];
	value: string;
	onChange: (periodId: string) => void;
}

export function PeriodPicker({ periods, value, onChange }: PeriodPickerProps) {
	const { t } = useLingui();
	const { formatDate } = useFormat();
	const label = (period: Period, year: boolean) => {
		const format = (date: Date) =>
			formatDate(date, {
				month: "short",
				day: "numeric",
				year: year ? "numeric" : undefined,
				timeZone: "UTC",
			});
		const start = format(period.start);
		const end = format(new Date(period.end.getTime() - 1));
		return period.closed
			? t({ message: `${start} to ${end}` })
			: t({ message: `${start} to ${end} (current)` });
	};
	const selected = periods.find((period) => period.id === value);

	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger
				className="min-w-0 flex-1 sm:flex-none"
				aria-label={t({ message: "Billing period" })}
			>
				<SelectValue>{selected && label(selected, false)}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{periods.map((period) => (
					<SelectItem key={period.id} value={period.id}>
						{label(period, true)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
