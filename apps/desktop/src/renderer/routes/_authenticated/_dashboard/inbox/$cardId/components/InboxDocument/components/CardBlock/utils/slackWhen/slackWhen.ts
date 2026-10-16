import { formatDate } from "@superset/i18n/format";
import { addDays, dayOf, type ZoneDay, zonedInstant } from "../zoneTime";

export const MORNING_MINUTE = 9 * 60;
const MONDAY = 1;
const WEEK_DAYS = 7;

/** A day and time without the year, "Oct 3 at 4:00 PM", in the reader's Slack zone. */
export function slackWhen(instant: number, timeZone: string): string {
	return formatDate(instant, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone,
	});
}

export function slackClock(instant: number, timeZone: string): string {
	return formatDate(instant, { hour: "numeric", minute: "2-digit", timeZone });
}

export function slackWeekday(instant: number, timeZone: string): string {
	return formatDate(instant, { weekday: "long", timeZone });
}

const weekdayOf = (day: ZoneDay) =>
	new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();

export function tomorrowMorning(now: number, timeZone: string): number {
	return zonedInstant(
		addDays(dayOf(now, timeZone), 1),
		MORNING_MINUTE,
		timeZone,
	);
}

/** 9:00 on the first Monday after tomorrow, so it never repeats "Tomorrow". */
export function mondayMorning(now: number, timeZone: string): number {
	const afterTomorrow = addDays(dayOf(now, timeZone), 2);
	const ahead = (MONDAY - weekdayOf(afterTomorrow) + WEEK_DAYS) % WEEK_DAYS;
	return zonedInstant(addDays(afterTomorrow, ahead), MORNING_MINUTE, timeZone);
}
