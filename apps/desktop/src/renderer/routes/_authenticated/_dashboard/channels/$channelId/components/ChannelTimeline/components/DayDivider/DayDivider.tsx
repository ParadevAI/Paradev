import { Trans } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { Calendar } from "@superset/ui/calendar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { type ReactNode, useRef, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import type { JumpOption } from "../../utils/jumpTarget";

interface DayDividerProps {
	date: Date;
	onJump: (option: JumpOption) => void;
	onJumpToDate: (date: Date) => void;
}

/** Slack's day rule: a centred pill on a full-width line that jumps through history. */
export function DayDivider({ date, onJump, onJumpToDate }: DayDividerProps) {
	const [picking, setPicking] = useState(false);
	const pickAfterClose = useRef(false);
	const options: { value: JumpOption; label: ReactNode }[] = [
		{ value: "today", label: <Trans>Today</Trans> },
		{ value: "yesterday", label: <Trans>Yesterday</Trans> },
		{ value: "last-week", label: <Trans>Last week</Trans> },
		{ value: "last-month", label: <Trans>Last month</Trans> },
		{ value: "beginning", label: <Trans>The very beginning</Trans> },
	];
	return (
		<div
			data-day={date.getTime()}
			className="relative my-3 flex items-center justify-center px-4"
		>
			<div className="absolute inset-x-0 h-px bg-border" />
			<Popover open={picking} onOpenChange={setPicking}>
				<DropdownMenu>
					<PopoverAnchor asChild>
						<DropdownMenuTrigger className="relative flex items-center gap-1 rounded-full border border-border bg-background py-1 pr-3 pl-4 text-[13px] font-semibold hover:bg-[image:linear-gradient(var(--fill-hover),var(--fill-hover))] data-[state=open]:bg-[image:linear-gradient(var(--fill-hover),var(--fill-hover))]">
							{formatDate(date, {
								weekday: "long",
								month: "long",
								day: "numeric",
							})}
							<LuChevronDown className="size-3.5 text-muted-foreground" />
						</DropdownMenuTrigger>
					</PopoverAnchor>
					<DropdownMenuContent
						align="center"
						className="min-w-56"
						onCloseAutoFocus={(event) => {
							if (!pickAfterClose.current) return;
							pickAfterClose.current = false;
							event.preventDefault();
							setPicking(true);
						}}
					>
						<DropdownMenuLabel className="font-normal text-muted-foreground">
							<Trans>Jump to…</Trans>
						</DropdownMenuLabel>
						{options.map((option) => (
							<DropdownMenuItem
								key={option.value}
								onSelect={() => onJump(option.value)}
							>
								{option.label}
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onSelect={() => {
								pickAfterClose.current = true;
							}}
						>
							<Trans>Jump to a specific date</Trans>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<PopoverContent align="center" className="w-auto p-0">
					<Calendar
						mode="single"
						defaultMonth={date}
						disabled={{ after: new Date() }}
						onSelect={(picked) => {
							setPicking(false);
							if (picked) onJumpToDate(picked);
						}}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
