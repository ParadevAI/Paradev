"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { format, parseISO } from "date-fns";
import { useRef, useState } from "react";
import { LuCalendar, LuChevronDown } from "react-icons/lu";
import { useIsMobile } from "../../hooks/use-mobile";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";

import { useFormatRange } from "./hooks/useFormatRange";
import {
	type DatePreset,
	type DateRangeValue,
	presetOf,
	valueOfPreset,
} from "./utils/choice";

export interface DateRangePickerProps {
	value: DateRangeValue;
	/** The first and last day that can be picked, as `yyyy-MM-dd`; null when no day can be. */
	bounds: { earliest: string; latest: string } | null;
	groups: DatePreset[][];
	onChange: (value: DateRangeValue) => void;
}

const toDay = (date: Date) => format(date, "yyyy-MM-dd");

export function DateRangePicker({
	value,
	bounds,
	groups,
	onChange,
}: DateRangePickerProps) {
	const { t } = useLingui();
	const range = useFormatRange();
	const narrow = useIsMobile();
	const trigger = useRef<HTMLButtonElement>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [calendarOpen, setCalendarOpen] = useState(false);
	const [picked, setPicked] = useState<{ from: Date | undefined; to?: Date }>();
	const preset = presetOf(value, groups);
	const choose = (next: DateRangeValue) => {
		onChange(next);
		setCalendarOpen(false);
	};

	return (
		<Popover
			open={calendarOpen}
			onOpenChange={(open) => {
				setCalendarOpen(open);
				setPicked(undefined);
			}}
		>
			<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<PopoverAnchor asChild>
					<DropdownMenuTrigger asChild>
						<Button
							ref={trigger}
							variant="outline"
							size="sm"
							className="max-w-full"
							disabled={!bounds}
						>
							<LuCalendar />
							{bounds ? (
								<span className="flex min-w-0 gap-2">
									<span className="truncate">
										{preset?.label ?? t({ message: "Custom" })}
									</span>
									<span className="text-muted-foreground truncate">
										{range(value.from, value.to)}
									</span>
								</span>
							) : (
								<Trans>No days available</Trans>
							)}
							<LuChevronDown />
						</Button>
					</DropdownMenuTrigger>
				</PopoverAnchor>
				<DropdownMenuContent
					align="end"
					onCloseAutoFocus={(event) => calendarOpen && event.preventDefault()}
				>
					<DropdownMenuRadioGroup
						value={preset?.key ?? ""}
						onValueChange={(key) => {
							const next = groups.flat().find((item) => item.key === key);
							if (next) choose(valueOfPreset(next));
						}}
					>
						{groups.map((group) => (
							<div key={group[0]?.key}>
								{group.map((item) => (
									<DropdownMenuRadioItem
										key={item.key}
										value={item.key}
										className="justify-between gap-6"
									>
										{item.label}
										<span className="text-muted-foreground text-xs">
											{range(item.from, item.to)}
										</span>
									</DropdownMenuRadioItem>
								))}
								<DropdownMenuSeparator />
							</div>
						))}
					</DropdownMenuRadioGroup>
					<DropdownMenuItem onSelect={() => setCalendarOpen(true)}>
						<Trans>Custom range…</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{bounds && (
				<PopoverContent
					className="w-auto p-3"
					align="end"
					onFocusOutside={(event) => event.preventDefault()}
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						trigger.current?.focus();
					}}
				>
					<Calendar
						mode="range"
						resetOnSelect
						numberOfMonths={narrow ? 1 : 2}
						selected={
							picked ?? { from: parseISO(value.from), to: parseISO(value.to) }
						}
						defaultMonth={parseISO(value.from)}
						startMonth={parseISO(bounds.earliest)}
						endMonth={parseISO(bounds.latest)}
						disabled={[
							{ before: parseISO(bounds.earliest) },
							{ after: parseISO(bounds.latest) },
						]}
						onSelect={(selected) => {
							if (selected?.from && selected.to) {
								choose({
									from: toDay(selected.from),
									to: toDay(selected.to),
									preset: null,
								});
							} else setPicked(selected);
						}}
					/>
				</PopoverContent>
			)}
		</Popover>
	);
}
