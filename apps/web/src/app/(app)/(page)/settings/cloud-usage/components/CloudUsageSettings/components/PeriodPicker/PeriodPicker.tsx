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

	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger
				className="min-w-0 flex-1 sm:flex-none"
				aria-label={t({ message: "Billing period" })}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{periods.map((period) => {
					const start = formatDate(period.start);
					const end = formatDate(period.end);
					return (
						<SelectItem key={period.id} value={period.id}>
							{period.closed
								? t({ message: `${start} to ${end}` })
								: t({ message: `${start} to ${end} (current)` })}
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
