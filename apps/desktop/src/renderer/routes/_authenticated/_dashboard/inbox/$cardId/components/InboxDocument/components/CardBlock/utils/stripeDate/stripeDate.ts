import { formatDate } from "@superset/i18n/format";
import type { ZoneDay } from "../zoneTime";

/** "Nov 3, 2037" */
export function stripeDate(iso: string): string {
	return formatDate(new Date(iso));
}

export function localDay(iso: string): ZoneDay {
	const date = new Date(iso);
	return {
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate(),
	};
}

/** The local day that many days after `from`. */
export function addLocalDays(from: Date, days: number): ZoneDay {
	return localDay(
		new Date(
			from.getFullYear(),
			from.getMonth(),
			from.getDate() + days,
		).toISOString(),
	);
}

/** Whole local days from `from` to the day of `iso`; negative when that day has passed. */
export function localDaysUntil(from: Date, iso: string): number {
	const to = new Date(iso);
	return Math.round(
		(Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) -
			Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) /
			(24 * 60 * 60_000),
	);
}

/** 00:00 local time of the day, as an ISO instant. */
export function startOfLocalDay(day: ZoneDay): string {
	return new Date(day.year, day.month - 1, day.day).toISOString();
}
