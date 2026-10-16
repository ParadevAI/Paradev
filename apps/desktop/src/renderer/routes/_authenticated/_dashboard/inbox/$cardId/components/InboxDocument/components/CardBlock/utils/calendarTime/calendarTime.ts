import { formatDate, getActiveLocale } from "@superset/i18n/format";
import type { CalendarSpan } from "../../types";

/** Intl separates with thin and narrow no-break spaces, which read badly in a plain-text reply. */
function plainSpaces(text: string): string {
	return text.replace(/[   ]/g, " ");
}

function range(
	span: CalendarSpan,
	options: Intl.DateTimeFormatOptions,
): string {
	return plainSpaces(
		new Intl.DateTimeFormat(getActiveLocale(), options).formatRange(
			Date.parse(span.start),
			Date.parse(span.end),
		),
	);
}

/** "10:00 – 10:45 AM" */
export function timeRange(span: CalendarSpan, timeZone: string): string {
	return range(span, { hour: "numeric", minute: "2-digit", timeZone });
}

/** "Tuesday, October 6"; an all-day span ends at the next midnight, so its last day is the one before. */
export function dayLine(
	span: CalendarSpan,
	timeZone: string,
	allDay = false,
): string {
	const options: Intl.DateTimeFormatOptions = {
		weekday: "long",
		month: "long",
		day: "numeric",
		timeZone,
	};
	if (!allDay) return plainSpaces(formatDate(Date.parse(span.start), options));
	return range(
		{
			start: span.start,
			end: new Date(Date.parse(span.end) - 1).toISOString(),
		},
		options,
	);
}

/** "Tuesday, October 6 · 10:00 – 10:45 AM", as Google heads an event. */
export function eventLine(event: {
	start: string;
	end: string;
	allDay: boolean;
	timeZone: string;
}): string {
	if (event.allDay) return dayLine(event, event.timeZone, true);
	const sameDay =
		dayLine(event, event.timeZone) ===
		dayLine({ start: event.end, end: event.end }, event.timeZone);
	if (!sameDay)
		return range(event, {
			weekday: "long",
			month: "long",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
			timeZone: event.timeZone,
		});
	return `${dayLine(event, event.timeZone)} · ${timeRange(event, event.timeZone)}`;
}

/** "Tue, Oct 6, 10:00 – 10:30 AM PDT", the form a time takes in a reply. */
export function slotLine(span: CalendarSpan, timeZone: string): string {
	return range(span, {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
		timeZone,
	});
}

/** "PDT" */
export function zoneLabel(instant: number, timeZone: string): string {
	return (
		new Intl.DateTimeFormat(getActiveLocale(), {
			timeZone,
			timeZoneName: "short",
		})
			.formatToParts(instant)
			.find((part) => part.type === "timeZoneName")?.value ?? ""
	);
}

/** "8 AM" */
export function hourLabel(hour: number): string {
	return plainSpaces(
		formatDate(Date.UTC(2026, 0, 1, hour), {
			hour: "numeric",
			timeZone: "UTC",
		}),
	);
}
