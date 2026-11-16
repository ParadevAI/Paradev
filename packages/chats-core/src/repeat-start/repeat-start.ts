import { ruleParts, type TimeOfDay } from "../repeat-rule/repeat-rule.ts";

/** A calendar day (`YYYY-MM-DD`) and wall-clock time, as read in the creator's zone. */
export interface LocalMoment {
	date: string;
	time: TimeOfDay;
}

const DAY_MS = 86_400_000;
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const STEPPABLE = new Set([
	"FREQ",
	"INTERVAL",
	"BYDAY",
	"WKST",
	"UNTIL",
	"COUNT",
]);

/** Days since the epoch: plain calendar arithmetic, with no zone or DST in the way. */
const dayNumber = (date: string) => {
	const [y, m, d] = date.split("-").map(Number);
	return Date.UTC(y!, m! - 1, d!) / DAY_MS;
};
const dateOf = (day: number) =>
	new Date(day * DAY_MS).toISOString().slice(0, 10);
const minutes = ({ hour, minute }: TimeOfDay) => hour * 60 + minute;

/**
 * The day a daily-or-longer repeat first happens at `time`: `from`, or the first day after it that the rule allows and
 * that hasn't passed by `now`. So "every monday at 9" typed on a Tuesday starts next Monday, "every day at 9" typed at
 * 10 starts tomorrow, and "every month" typed after its time starts on the same date next month, which is the
 * occurrence the server would pick from the same rule. Rules it can't step (numbered BYDAY, BYMONTHDAY, sub-daily)
 * keep `from`, and the server finds their first occurrence.
 */
export function firstRepeatDay(
	rrule: string,
	from: string,
	time: TimeOfDay,
	now: LocalMoment,
): string {
	const parts = ruleParts(rrule);
	const days = parts.BYDAY?.split(",");
	if (
		Object.keys(parts).some((key) => !STEPPABLE.has(key)) ||
		days?.some((code) => !DAY_CODES.includes(code))
	)
		return from;
	const interval = Number(parts.INTERVAL ?? 1);
	const start = dayNumber(from);
	const anchor = new Date(start * DAY_MS);

	const allowed = (day: number) => {
		const date = new Date(day * DAY_MS);
		if (days) return days.includes(DAY_CODES[date.getUTCDay()]!);
		const months =
			(date.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
			date.getUTCMonth() -
			anchor.getUTCMonth();
		switch (parts.FREQ) {
			case "DAILY":
				return (day - start) % interval === 0;
			case "WEEKLY":
				return (day - start) % (7 * interval) === 0;
			case "MONTHLY":
				return (
					date.getUTCDate() === anchor.getUTCDate() && months % interval === 0
				);
			case "YEARLY":
				return (
					date.getUTCDate() === anchor.getUTCDate() &&
					months % (12 * interval) === 0
				);
			default:
				return null;
		}
	};
	const passed = (date: string) =>
		date < now.date ||
		(date === now.date && minutes(time) <= minutes(now.time));

	// Four years of the rule's period reaches even a 29 February.
	for (let day = start; day <= start + 4 * 366 * interval; day++) {
		const ok = allowed(day);
		if (ok === null) return from;
		if (ok && !passed(dateOf(day))) return dateOf(day);
	}
	return from;
}
