import { getActiveLocale } from "@superset/i18n/format";

export interface TimePeriod {
	unit: "day" | "week" | "month" | "year";
	count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const localMidnight = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Calendar distance from `now`, bucketed the way a person reads a list: days, then weeks, months, years. */
export function periodOf(date: Date, now: Date): TimePeriod {
	const days = Math.max(
		0,
		Math.round((localMidnight(now) - localMidnight(date)) / DAY_MS),
	);
	if (days < 7) return { unit: "day", count: days };
	if (days < 30) return { unit: "week", count: Math.floor(days / 7) };
	if (days < 365) return { unit: "month", count: Math.floor(days / 30) };
	return { unit: "year", count: Math.floor(days / 365) };
}

export function periodKey({ unit, count }: TimePeriod): string {
	return `${unit}:${count}`;
}

/** "Today", "Yesterday", "Last week", "2 months ago" in the active locale. */
export function formatPeriod({ unit, count }: TimePeriod): string {
	const locale = getActiveLocale();
	const label = new Intl.RelativeTimeFormat(locale, {
		numeric: "auto",
	}).format(-count, unit);
	return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}
