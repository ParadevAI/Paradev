import { formatClockTime, formatDate } from "@superset/i18n/format";

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** When a chat last moved, as a list row says it: the time today, the weekday this week, else a short date. */
export function listTime(at: Date, now: Date): string {
	const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
	if (days <= 0) return formatClockTime(at);
	if (days < 7) return formatDate(at, { weekday: "short" });
	return formatDate(at, {
		month: "short",
		day: "numeric",
		year: at.getFullYear() === now.getFullYear() ? undefined : "numeric",
	});
}
