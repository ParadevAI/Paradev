// Made once: building a formatter is the costly part, and every row of a list formats a time.
const TIME = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});
const DAY = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
});
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const DAY_YEAR = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
	year: "numeric",
});

const DAY_MS = 86_400_000;
/** Calendar days from `at` to `now`, in local time (so a daylight-saving change doesn't skew it). */
const daysBetween = (at: Date, now: Date) =>
	Math.round(
		(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
			Date.UTC(at.getFullYear(), at.getMonth(), at.getDate())) /
			DAY_MS,
	);

/** The sidebar's timestamp: a time for today, a short date otherwise. */
export function formatListTime(at: Date, now: Date): string {
	return daysBetween(at, now) === 0 ? TIME.format(at) : DAY.format(at);
}

/**
 * A chat's last activity as iMessage and WhatsApp list it: the time today, "Yesterday", the weekday within the
 * week, then the date (with its year once it's another year's).
 */
export function formatChatListTime(at: Date, now: Date): string {
	const days = daysBetween(at, now);
	if (days <= 0) return TIME.format(at);
	if (days === 1) return "Yesterday";
	if (days < 7) return WEEKDAY.format(at);
	return at.getFullYear() === now.getFullYear()
		? DAY.format(at)
		: DAY_YEAR.format(at);
}
