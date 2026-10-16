import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { KeyboardEvent, MouseEvent } from "react";
import type { CalendarBusyView, CalendarSpan } from "../../../../types";
import { dayLine, slotLine, timeRange } from "../../../../utils/calendarTime";
import {
	byStart,
	daySegment,
	overlaps,
	SNAP_MINUTES,
	sameSpan,
	shiftSpan,
	snapMinute,
	spanAt,
	within,
	type ZoneDay,
	zonedInstant,
} from "../../../../utils/zoneTime";
import { HOUR_PX, KEYBOARD_PICK_MINUTE } from "../../constants";
import { layoutLanes } from "../../utils/dayLayout";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MIN_BLOCK_PX = 16;

function box(segment: { from: number; to: number }) {
	return {
		top: (segment.from / 60) * HOUR_PX,
		height: Math.max(
			((segment.to - segment.from) / 60) * HOUR_PX,
			MIN_BLOCK_PX,
		),
	};
}

interface DayColumnProps {
	day: ZoneDay;
	timeZone: string;
	window: CalendarSpan;
	/** Timed events the reader has not declined. */
	busy: CalendarBusyView[];
	guestsBusy: CalendarSpan[];
	slots: CalendarSpan[];
	minutes: number;
	value: CalendarSpan[];
	mode: "single" | "multiple";
	disabled: boolean;
	onChange: (value: CalendarSpan[]) => void;
}

/** One day of the grid: the reader's events, the open times suggested, and what is picked. */
export function DayColumn({
	day,
	timeZone,
	window,
	busy,
	guestsBusy,
	slots,
	minutes,
	value,
	mode,
	disabled,
	onChange,
}: DayColumnProps) {
	const { t } = useLingui();
	const on = <T extends CalendarSpan>(spans: T[]) =>
		spans.flatMap((span, index) => {
			const segment = daySegment(span, day, timeZone);
			return segment ? [{ ...segment, span, index }] : [];
		});
	const startsHere = (span: CalendarSpan) =>
		Date.parse(span.start) >= zonedInstant(day, 0, timeZone);

	const add = (span: CalendarSpan) => {
		if (!within(span, window)) return;
		if (mode === "single") onChange([span]);
		else if (!value.some((picked) => sameSpan(picked, span)))
			onChange([...value, span].sort(byStart));
	};
	const remove = (index: number) =>
		onChange(value.filter((_, at) => at !== index));
	const move = (index: number, by: number) => {
		const current = value[index];
		if (!current) return;
		const next = shiftSpan(current, by);
		if (!within(next, window)) return;
		onChange(value.map((span, at) => (at === index ? next : span)));
	};

	const pickAt = (event: MouseEvent<HTMLButtonElement>) => {
		const minute =
			event.detail === 0
				? KEYBOARD_PICK_MINUTE
				: ((event.clientY - event.currentTarget.getBoundingClientRect().top) /
						HOUR_PX) *
					60;
		add(spanAt(day, snapMinute(minute), minutes, timeZone));
	};
	const onSelectionKey = (
		event: KeyboardEvent<HTMLButtonElement>,
		index: number,
	) => {
		if (event.key === "ArrowUp") move(index, -SNAP_MINUTES);
		else if (event.key === "ArrowDown") move(index, SNAP_MINUTES);
		else if (event.key === "Delete" || event.key === "Backspace") remove(index);
		else return;
		event.preventDefault();
	};

	const date = dayLine(
		{
			start: new Date(zonedInstant(day, 12 * 60, timeZone)).toISOString(),
			end: new Date(zonedInstant(day, 12 * 60, timeZone)).toISOString(),
		},
		timeZone,
	);

	return (
		<div
			className="relative min-w-20 flex-1 border-l border-border"
			style={{ height: 24 * HOUR_PX }}
		>
			{HOURS.map((hour) => (
				<div
					key={hour}
					aria-hidden
					className="border-b border-border/60"
					style={{ height: HOUR_PX }}
				/>
			))}
			<button
				type="button"
				disabled={disabled}
				onClick={pickAt}
				aria-label={t({ message: `Pick a time on ${date}` })}
				className="absolute inset-0 cursor-cell outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:cursor-default"
			/>
			{on(guestsBusy).map((segment) => (
				<div
					key={`guest-${segment.index}`}
					aria-hidden
					data-guest-busy
					className="pointer-events-none absolute inset-x-0 bg-muted-foreground/10"
					style={box(segment)}
				/>
			))}
			{layoutLanes(on(busy)).map((segment) => (
				<div
					key={segment.span.id}
					data-busy
					className={cn(
						"pointer-events-none absolute overflow-hidden rounded-[4px] border border-card bg-muted px-1.5 py-0.5 text-[11px] leading-tight text-foreground",
						segment.span.response === "needsAction" &&
							"border-muted-foreground/40 bg-card",
					)}
					style={{
						...box(segment),
						left: `${(segment.lane / segment.lanes) * 100}%`,
						width: `calc(${100 / segment.lanes}% - 6px)`,
					}}
				>
					<div className="truncate font-medium">{segment.span.title}</div>
					{segment.to - segment.from >= 45 && (
						<div className="truncate text-muted-foreground">
							{timeRange(segment.span, timeZone)}
						</div>
					)}
				</div>
			))}
			{on(slots)
				.filter(
					(segment) => !value.some((picked) => sameSpan(picked, segment.span)),
				)
				.map((segment) => {
					const line = slotLine(segment.span, timeZone);
					return (
						<button
							key={`slot-${segment.index}`}
							type="button"
							disabled={disabled}
							onClick={() => add(segment.span)}
							aria-pressed={false}
							aria-label={t({ message: `${line}, suggested time` })}
							className="absolute inset-x-0.5 overflow-hidden rounded-[4px] border border-dashed border-primary/70 bg-card/60 px-1.5 py-0.5 text-left text-[11px] leading-tight text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none"
							style={box(segment)}
						>
							{timeRange(segment.span, timeZone)}
						</button>
					);
				})}
			{on(value).map((segment) => {
				const clashes = busy.filter((event) => overlaps(event, segment.span));
				const guestBusy = guestsBusy.some((span) =>
					overlaps(span, segment.span),
				);
				const tone = cn(
					"absolute inset-x-0.5 truncate rounded-[4px] border px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight text-foreground",
					clashes.length > 0
						? "border-warning bg-[color-mix(in_oklab,var(--color-warning)_30%,var(--color-card))]"
						: "border-primary bg-[color-mix(in_oklab,var(--color-primary)_25%,var(--color-card))]",
				);
				if (!startsHere(segment.span))
					return (
						<div
							key={`selection-${segment.index}`}
							aria-hidden
							className={cn(tone, "pointer-events-none")}
							style={box(segment)}
						/>
					);
				const line = slotLine(segment.span, timeZone);
				const titles = clashes.map((event) => event.title).join(", ");
				const label =
					clashes.length > 0
						? t({ message: `${line}, selected, conflicts with ${titles}` })
						: guestBusy
							? t({ message: `${line}, selected, a guest is busy` })
							: t({ message: `${line}, selected` });
				return (
					<button
						key={`selection-${segment.index}`}
						type="button"
						disabled={disabled}
						aria-pressed
						aria-label={label}
						data-conflict={clashes.length > 0 || undefined}
						onClick={() => {
							if (mode === "multiple") remove(segment.index);
						}}
						onKeyDown={(event) => onSelectionKey(event, segment.index)}
						className={cn(
							tone,
							"z-10 outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						style={box(segment)}
					>
						{timeRange(segment.span, timeZone)}
					</button>
				);
			})}
		</div>
	);
}
