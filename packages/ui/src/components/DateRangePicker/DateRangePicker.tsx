"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { LuCalendar, LuChevronDown } from "react-icons/lu";
import { useIsMobile } from "../../hooks/use-mobile";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";

import { useFormatDay } from "./hooks/useFormatDay";
import {
	type DatePreset,
	type DateRangeValue,
	presetOf,
	valueOfPreset,
} from "./utils/choice";
import { toDate, toDay } from "./utils/days";

export interface DateRangePickerProps {
	value: DateRangeValue | null;
	earliest: string | null;
	latest: string | null;
	groups: DatePreset[][];
	onChange: (value: DateRangeValue) => void;
}

export function DateRangePicker({
	value,
	earliest,
	latest,
	groups,
	onChange,
}: DateRangePickerProps) {
	const { t } = useLingui();
	const day = useFormatDay();
	const narrow = useIsMobile();
	const [menuOpen, setMenuOpen] = useState(false);
	const [calendarOpen, setCalendarOpen] = useState(false);
	const [picked, setPicked] = useState<{ from: Date | undefined; to?: Date }>();
	const itemDays = (item: DatePreset) => {
		const [start, end] = [day(item.from), day(item.to)];
		return (
			<Trans>
				{start} to {end}
			</Trans>
		);
	};
	const preset = value && presetOf(value, groups);
	const name = preset?.label ?? t({ message: "Custom" });
	const from = value ? day(value.from) : "";
	const to = value ? day(value.to) : "";
	const choose = (next: DateRangeValue) => {
		onChange(next);
		setPicked(undefined);
		setCalendarOpen(false);
	};

	return (
		<Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
			<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<PopoverAnchor asChild>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" disabled={!earliest}>
							<LuCalendar />
							{!value ? (
								<Trans>No days available</Trans>
							) : (
								<Trans>
									{name} · {from} to {to}
								</Trans>
							)}
							<LuChevronDown />
						</Button>
					</DropdownMenuTrigger>
				</PopoverAnchor>
				<DropdownMenuContent
					align="end"
					onCloseAutoFocus={(event) => calendarOpen && event.preventDefault()}
				>
					{groups.map((group) => (
						<div key={group[0]?.key}>
							{group.map((item) => (
								<DropdownMenuItem
									key={item.key}
									className="justify-between gap-6"
									onSelect={() => choose(valueOfPreset(item))}
								>
									<span
										className={preset?.key === item.key ? "font-medium" : ""}
									>
										{item.label}
									</span>
									<span className="text-muted-foreground text-xs">
										{itemDays(item)}
									</span>
								</DropdownMenuItem>
							))}
							<DropdownMenuSeparator />
						</div>
					))}
					<DropdownMenuItem onSelect={() => setCalendarOpen(true)}>
						<Trans>Custom range…</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{earliest && latest && (
				<PopoverContent
					className="w-auto p-3"
					align="end"
					onFocusOutside={(event) => event.preventDefault()}
				>
					<Calendar
						mode="range"
						resetOnSelect
						numberOfMonths={narrow ? 1 : 2}
						selected={
							picked ??
							(value
								? { from: toDate(value.from), to: toDate(value.to) }
								: undefined)
						}
						defaultMonth={toDate(value?.from ?? latest)}
						disabled={(date) => toDay(date) < earliest || toDay(date) > latest}
						onSelect={(range) => {
							if (range?.from && range.to) {
								choose({
									from: toDay(range.from),
									to: toDay(range.to),
									preset: null,
								});
							} else setPicked(range);
						}}
					/>
				</PopoverContent>
			)}
		</Popover>
	);
}
