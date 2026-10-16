import { useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { CalendarBusyView, CalendarSpan } from "../../types";
import { hourLabel, zoneLabel } from "../../utils/calendarTime";
import {
	dayKey,
	daySegment,
	windowDays,
	zonedInstant,
} from "../../utils/zoneTime";
import { DayColumn } from "./components/DayColumn";
import { FIRST_VISIBLE_HOUR, HOUR_PX } from "./constants";

const HOUR_MARKS = Array.from({ length: 23 }, (_, index) => index + 1);
const SCROLL_LEAD_PX = 8;
/** Hours the grid shows without scrolling, less the header. */
const VISIBLE_HOURS = 6;

interface SlotPickerProps {
	/** The days to draw, at most seven. */
	window: CalendarSpan;
	/** IANA zone the grid's days and hours are in. */
	timeZone: string;
	busy: CalendarBusyView[];
	/** When guests are busy; drawn as bands without titles. */
	guestsBusy?: { email: string; busy: CalendarSpan[] }[];
	/** Open times to offer, drawn as outlined blocks. */
	slots?: CalendarSpan[];
	/** How long a time picked from empty space is. */
	minutes: number;
	value: CalendarSpan[];
	onChange: (value: CalendarSpan[]) => void;
	mode: "single" | "multiple";
	disabled?: boolean;
	className?: string;
}

/** A day grid like Google Calendar's "Find a time": the reader's events, suggested open times, and the times picked. */
export function SlotPicker({
	window,
	timeZone,
	busy,
	guestsBusy,
	slots = [],
	minutes,
	value,
	onChange,
	mode,
	disabled = false,
	className,
}: SlotPickerProps) {
	const { t } = useLingui();
	const scroller = useRef<HTMLDivElement>(null);
	const days = windowDays(window, timeZone);
	const timed = useMemo(
		() =>
			busy.filter((event) => !event.allDay && event.response !== "declined"),
		[busy],
	);
	const allDay = busy.filter((event) => event.allDay);
	const firstPicked = value[0];
	const pickedAt = firstPicked
		? days
				.map((day) => daySegment(firstPicked, day, timeZone))
				.find((segment) => segment !== null)
		: undefined;
	const firstHour =
		pickedAt &&
		(pickedAt.from < FIRST_VISIBLE_HOUR * 60 ||
			pickedAt.to > (FIRST_VISIBLE_HOUR + VISIBLE_HOURS) * 60)
			? Math.max(pickedAt.from / 60 - 1, 0)
			: FIRST_VISIBLE_HOUR;
	const scrollTo = useRef(firstHour * HOUR_PX - SCROLL_LEAD_PX);
	useLayoutEffect(() => {
		if (scroller.current) scroller.current.scrollTop = scrollTo.current;
	}, []);
	const guestSpans = useMemo(
		() => (guestsBusy ?? []).flatMap((guest) => guest.busy),
		[guestsBusy],
	);

	return (
		<section
			aria-label={t({ message: "Calendar" })}
			className={cn(
				"overflow-hidden rounded-md border border-border",
				className,
			)}
		>
			<div ref={scroller} className="max-h-[22rem] overflow-auto">
				<div className="min-w-fit">
					<div className="sticky top-0 z-20 flex border-b border-border bg-card">
						<div className="flex w-12 shrink-0 items-end justify-end px-1.5 pb-1 text-[10px] text-muted-foreground">
							{zoneLabel(
								zonedInstant(
									days[0] ?? { year: 2026, month: 1, day: 1 },
									720,
									timeZone,
								),
								timeZone,
							)}
						</div>
						{days.map((day) => {
							const noon = zonedInstant(day, 12 * 60, timeZone);
							return (
								<div
									key={dayKey(day)}
									className="flex min-w-20 flex-1 flex-col gap-0.5 border-l border-border px-1.5 py-1"
								>
									<span className="text-[11px] font-medium text-muted-foreground">
										{formatDate(noon, {
											weekday: "short",
											month: "short",
											day: "numeric",
											timeZone,
										})}
									</span>
									{allDay
										.filter((event) => daySegment(event, day, timeZone))
										.map((event) => (
											<span
												key={event.id}
												data-all-day
												className="truncate rounded-[4px] bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-tight text-foreground"
											>
												{event.title}
											</span>
										))}
								</div>
							);
						})}
					</div>
					<div className="flex">
						<div
							aria-hidden
							className="relative w-12 shrink-0"
							style={{ height: 24 * HOUR_PX }}
						>
							{HOUR_MARKS.map((hour) => (
								<span
									key={hour}
									className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[10px] text-muted-foreground"
									style={{ top: hour * HOUR_PX }}
								>
									{hourLabel(hour)}
								</span>
							))}
						</div>
						{days.map((day) => (
							<DayColumn
								key={dayKey(day)}
								day={day}
								timeZone={timeZone}
								window={window}
								busy={timed}
								guestsBusy={guestSpans}
								slots={slots}
								minutes={minutes}
								value={value}
								mode={mode}
								disabled={disabled}
								onChange={onChange}
							/>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
