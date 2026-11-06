import { formatDateTime } from "@superset/i18n/format";

/** A message's time as a row shows it: the clock today, the date and clock otherwise. */
export function messageTime(at: Date, now: Date = new Date()): string {
	const sameDay =
		at.getFullYear() === now.getFullYear() &&
		at.getMonth() === now.getMonth() &&
		at.getDate() === now.getDate();
	return sameDay
		? formatDateTime(at, { timeStyle: "short" })
		: formatDateTime(at, { dateStyle: "medium", timeStyle: "short" });
}
