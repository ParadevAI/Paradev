import { formatDate, formatNumber } from "@superset/i18n/format";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { type KeyboardEvent, useState } from "react";
import {
	DAY_MINUTES,
	SNAP_MINUTES,
	type ZoneDay,
	zonedInstant,
} from "../../utils/zoneTime";

interface TimeSelectProps {
	day: ZoneDay;
	/** Minutes past the day's midnight. */
	value: number;
	timeZone: string;
	onChange: (value: number) => void;
	label: string;
	/** The start's minute, for an end on the same day: the list begins there and each time carries the length. */
	from?: number;
	disabled?: boolean;
	invalid?: boolean;
	className?: string;
}

const HOUR = 60;
const HALF_HOUR = 30;

function lengths(): number[] {
	const quarters = [0, 15, 30, 45, 60];
	const halves: number[] = [];
	for (let length = 90; length < DAY_MINUTES; length += HALF_HOUR)
		halves.push(length);
	return [...quarters, ...halves];
}

function minutesOffered(value: number, from: number | undefined): number[] {
	const offered =
		from === undefined
			? Array.from(
					{ length: DAY_MINUTES / SNAP_MINUTES },
					(_, index) => index * SNAP_MINUTES,
				)
			: lengths().map((length) => from + length);
	return offered.includes(value)
		? offered
		: [...offered, value].sort((a, b) => a - b);
}

function lengthLabel(minutes: number): string {
	return minutes < HOUR
		? formatNumber(minutes, { style: "unit", unit: "minute" })
		: formatNumber(minutes / HOUR, { style: "unit", unit: "hour" });
}

/** Google's time field: a list of times a quarter hour apart, opened at the current one. */
export function TimeSelect({
	day,
	value,
	timeZone,
	onChange,
	label,
	from,
	disabled,
	invalid,
	className,
}: TimeSelectProps) {
	const [open, setOpen] = useState(false);
	const timeAt = (minute: number) =>
		formatDate(zonedInstant(day, minute, timeZone), {
			hour: "numeric",
			minute: "2-digit",
			timeZone,
		});
	const move = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		event.preventDefault();
		const active = document.activeElement;
		const next =
			event.key === "ArrowDown"
				? active?.nextElementSibling
				: active?.previousElementSibling;
		if (next instanceof HTMLElement) next.focus();
	};
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					aria-label={label}
					aria-haspopup="listbox"
					aria-invalid={invalid || undefined}
					className={className}
				>
					{timeAt(value)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-48 p-0"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					const chosen = (event.currentTarget as HTMLElement).querySelector(
						'[aria-selected="true"]',
					);
					if (!(chosen instanceof HTMLElement)) return;
					chosen.scrollIntoView?.({ block: "center" });
					chosen.focus({ preventScroll: true });
				}}
			>
				<div
					role="listbox"
					aria-label={label}
					onKeyDown={move}
					className="flex max-h-52 flex-col overflow-y-auto py-1"
				>
					{minutesOffered(value, from).map((minute) => (
						<button
							key={minute}
							type="button"
							role="option"
							aria-selected={minute === value}
							onClick={() => {
								onChange(minute);
								setOpen(false);
							}}
							className={cn(
								"shrink-0 px-3 py-2 text-left text-[13px] text-foreground outline-none hover:bg-fill-hover focus-visible:bg-fill-hover",
								minute === value && "bg-fill-hover font-medium",
							)}
						>
							{timeAt(minute)}
							{from !== undefined && (
								<span className="text-muted-foreground">
									{" "}
									({lengthLabel(minute - from)})
								</span>
							)}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
