import { formatDate } from "@superset/i18n/format";
import { Calendar } from "@superset/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import type { ZoneDay } from "../../utils/zoneTime";

interface DateFieldProps {
	value: ZoneDay;
	onChange: (value: ZoneDay) => void;
	label: string;
	disabled?: boolean;
	invalid?: boolean;
	className?: string;
}

const localDate = (day: ZoneDay) => new Date(day.year, day.month - 1, day.day);

/** Google's date field: the day as "Oct 6, 2026", opening a month to pick from. */
export function DateField({
	value,
	onChange,
	label,
	disabled,
	invalid,
	className,
}: DateFieldProps) {
	const [open, setOpen] = useState(false);
	const selected = localDate(value);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label={label}
					aria-invalid={invalid || undefined}
					className={className}
				>
					{formatDate(selected)}
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				<Calendar
					mode="single"
					selected={selected}
					defaultMonth={selected}
					onSelect={(date) => {
						if (date)
							onChange({
								year: date.getFullYear(),
								month: date.getMonth() + 1,
								day: date.getDate(),
							});
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
