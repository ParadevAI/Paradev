import type { CalendarSpan } from "../../types";

export const MINUTE_MS = 60_000;
export const DAY_MINUTES = 24 * 60;
export const SNAP_MINUTES = 15;

/** Not for display: fixes the calendar and digits so the parts parse as numbers in every app language. */
const PARSE_LOCALE = "en-u-ca-gregory-nu-latn";

export interface ZoneDay {
	year: number;
	month: number;
	day: number;
}

interface ZoneClock extends ZoneDay {
	hour: number;
	minute: number;
	second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function clock(instant: number, timeZone: string): ZoneClock {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(PARSE_LOCALE, {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
			second: "numeric",
		});
		formatters.set(timeZone, formatter);
	}
	const parts: Record<string, number> = {};
	for (const part of formatter.formatToParts(instant))
		if (part.type !== "literal") parts[part.type] = Number(part.value);
	return {
		year: parts.year ?? 0,
		month: parts.month ?? 1,
		day: parts.day ?? 1,
		hour: parts.hour ?? 0,
		minute: parts.minute ?? 0,
		second: parts.second ?? 0,
	};
}

function offsetMs(instant: number, timeZone: string): number {
	const at = clock(instant, timeZone);
	return (
		Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second) -
		Math.floor(instant / 1000) * 1000
	);
}

/** The instant a wall-clock minute of a day falls on in a zone; minutes past the day's end run into the next day. */
export function zonedInstant(
	day: ZoneDay,
	minuteOfDay: number,
	timeZone: string,
): number {
	const wall = Date.UTC(day.year, day.month - 1, day.day, 0, minuteOfDay);
	const guess = wall - offsetMs(wall, timeZone);
	return wall - offsetMs(guess, timeZone);
}

export function dayOf(instant: number, timeZone: string): ZoneDay {
	const { year, month, day } = clock(instant, timeZone);
	return { year, month, day };
}

export function minuteOfDay(instant: number, timeZone: string): number {
	const at = clock(instant, timeZone);
	return at.hour * 60 + at.minute;
}

export function addDays(day: ZoneDay, count: number): ZoneDay {
	const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + count));
	return {
		year: moved.getUTCFullYear(),
		month: moved.getUTCMonth() + 1,
		day: moved.getUTCDate(),
	};
}

export function dayKey(day: ZoneDay): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${day.year}-${pad(day.month)}-${pad(day.day)}`;
}

/** The days a window covers in a zone, first to last, at most `max`. */
export function windowDays(
	window: CalendarSpan,
	timeZone: string,
	max = 7,
): ZoneDay[] {
	const first = dayOf(Date.parse(window.start), timeZone);
	const last = dayKey(
		dayOf(
			Math.max(Date.parse(window.end) - 1, Date.parse(window.start)),
			timeZone,
		),
	);
	const days: ZoneDay[] = [];
	for (let day = first; days.length < max; day = addDays(day, 1)) {
		days.push(day);
		if (dayKey(day) >= last) break;
	}
	return days;
}

export function snapMinute(minute: number, step = SNAP_MINUTES): number {
	const snapped = Math.floor(minute / step) * step;
	return Math.min(Math.max(snapped, 0), DAY_MINUTES - step);
}

function span(start: number, end: number): CalendarSpan {
	return {
		start: new Date(start).toISOString(),
		end: new Date(end).toISOString(),
	};
}

/** A span of `minutes` of real time that starts at a wall-clock minute of a day. */
export function spanAt(
	day: ZoneDay,
	minute: number,
	minutes: number,
	timeZone: string,
): CalendarSpan {
	const start = zonedInstant(day, minute, timeZone);
	return span(start, start + minutes * MINUTE_MS);
}

export function shiftSpan(value: CalendarSpan, minutes: number): CalendarSpan {
	return span(
		Date.parse(value.start) + minutes * MINUTE_MS,
		Date.parse(value.end) + minutes * MINUTE_MS,
	);
}

export function spanMinutes(value: CalendarSpan): number {
	return Math.round(
		(Date.parse(value.end) - Date.parse(value.start)) / MINUTE_MS,
	);
}

export function overlaps(a: CalendarSpan, b: CalendarSpan): boolean {
	return (
		Date.parse(a.start) < Date.parse(b.end) &&
		Date.parse(b.start) < Date.parse(a.end)
	);
}

export function sameSpan(a: CalendarSpan, b: CalendarSpan): boolean {
	return (
		Date.parse(a.start) === Date.parse(b.start) &&
		Date.parse(a.end) === Date.parse(b.end)
	);
}

export function within(value: CalendarSpan, window: CalendarSpan): boolean {
	return (
		Date.parse(value.start) >= Date.parse(window.start) &&
		Date.parse(value.end) <= Date.parse(window.end)
	);
}

export function byStart(a: CalendarSpan, b: CalendarSpan): number {
	return Date.parse(a.start) - Date.parse(b.start);
}

/** The wall-clock minutes of a day a span covers, or null when it misses the day. */
export function daySegment(
	value: CalendarSpan,
	day: ZoneDay,
	timeZone: string,
): { from: number; to: number } | null {
	const start = Date.parse(value.start);
	const end = Date.parse(value.end);
	const dayStart = zonedInstant(day, 0, timeZone);
	const dayEnd = zonedInstant(addDays(day, 1), 0, timeZone);
	if (end <= dayStart || start >= dayEnd) return null;
	const from = start <= dayStart ? 0 : minuteOfDay(start, timeZone);
	const to = end >= dayEnd ? DAY_MINUTES : minuteOfDay(end, timeZone);
	return { from, to: Math.max(to, from + SNAP_MINUTES) };
}
