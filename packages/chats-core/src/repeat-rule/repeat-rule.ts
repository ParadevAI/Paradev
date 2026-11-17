/** A wall-clock time of day. */
export interface TimeOfDay {
	hour: number;
	minute: number;
}

/** 9:00, when calendars start something that has a day but no time: repeats, `/task` and the task forms do too. */
export const MORNING: TimeOfDay = { hour: 9, minute: 0 };

/**
 * The product's floor between a task's occurrences: each one is a Dev turn, and more often than hourly would keep a
 * Dev busy around the clock.
 */
export const MIN_REPEAT_MINUTES = 60;

export const REPEAT_TOO_OFTEN = "Tasks can repeat at most once an hour";

/** A repeat as typed: the RFC 5545 rule, and the time of day the words named ("at 9"), if any. */
export interface RepeatRule {
	/** Without `RRULE:`, e.g. `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`. The time of day lives in the series' start, not here. */
	rrule: string;
	time: TimeOfDay | null;
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const WEEKDAYS = "MO,TU,WE,TH,FR";
const WEEKEND = "SA,SU";

const UNITS: Record<string, string> = {
	minute: "MINUTELY",
	hour: "HOURLY",
	day: "DAILY",
	week: "WEEKLY",
	month: "MONTHLY",
	year: "YEARLY",
};

const ADVERBS: Record<string, string> = {
	hourly: "HOURLY",
	daily: "DAILY",
	weekly: "WEEKLY",
	monthly: "MONTHLY",
	yearly: "YEARLY",
	annually: "YEARLY",
};

/** The day code for a weekday word ("mon", "tuesday", "thurs"), or null. */
export function weekdayCode(word: string): (typeof DAY_CODES)[number] | null {
	if (
		!/^(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(day|nesday|rsday|urday)?s?$/.test(
			word,
		)
	)
		return null;
	const index = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(
		word.slice(0, 3),
	);
	return DAY_CODES[index] ?? null;
}

/**
 * A time of day from words: "9", "9am", "9:30", "9.30pm", "17:00", "noon", "midnight". Bare hours are read as given
 * (24-hour), except that "at 1"–"at 6" mean the afternoon only with "pm".
 */
export function parseTimeOfDay(text: string): TimeOfDay | null {
	const t = text.trim().toLowerCase();
	if (t === "noon" || t === "midday") return { hour: 12, minute: 0 };
	if (t === "midnight") return { hour: 0, minute: 0 };
	const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(t);
	if (!m) return null;
	let hour = Number(m[1]);
	const minute = m[2] ? Number(m[2]) : 0;
	const suffix = m[3]?.replace(/\./g, "");
	if (minute > 59 || hour > 23 || (suffix && (hour < 1 || hour > 12)))
		return null;
	if (suffix === "pm" && hour !== 12) hour += 12;
	if (suffix === "am" && hour === 12) hour = 0;
	return { hour, minute };
}

/** Whether a word, on its own, reads as a time ("10am", "9:30", "noon"); a bare "9" needs an "at" in front. */
export function isTimeWord(word: string): boolean {
	return (
		/^(\d{1,2}([:.]\d{2})?\s*(am|pm)|\d{1,2}[:.]\d{2}|noon|midnight)$/i.test(
			word,
		) && parseTimeOfDay(word) !== null
	);
}

/** RFC 5545 rule text: upper-case `KEY=VALUE` parts with a FREQ, as stored (without the `RRULE:` prefix). */
function rawRule(text: string): string | null {
	const body = text.trim().replace(/^RRULE:/i, "");
	if (!/^FREQ=/i.test(body)) return null;
	const parts = body.split(";").filter(Boolean);
	if (!parts.every((p) => /^[A-Z]+=[A-Z0-9,+\-:]+$/i.test(p))) return null;
	return parts.map((p) => p.toUpperCase()).join(";");
}

/**
 * Reads a repeat from words or a raw rule: "every weekday at 9", "daily at 8am", "every 2 weeks on friday",
 * "every mon and thu at 18:30", "every 2 hours", or `FREQ=DAILY;INTERVAL=2`. Null when it isn't one.
 */
export function parseRepeat(text: string): RepeatRule | null {
	const raw = rawRule(text);
	if (raw) return { rrule: raw, time: null };

	let words = text
		.toLowerCase()
		.replace(/,/g, " ")
		.split(/\s+/)
		.filter(Boolean);
	let time: TimeOfDay | null = null;
	const at = words.indexOf("at");
	if (at !== -1) {
		time = parseTimeOfDay(words.slice(at + 1).join(" "));
		if (!time) return null;
		words = words.slice(0, at);
	} else if (words.length > 1 && isTimeWord(words.at(-1)!)) {
		time = parseTimeOfDay(words.at(-1)!);
		words = words.slice(0, -1);
	}

	const rule = ruleFromWords(words);
	return rule ? { rrule: rule, time } : null;
}

function ruleFromWords(words: string[]): string | null {
	const [first, ...rest] = words;
	if (!first) return null;
	if (rest.length === 0 && ADVERBS[first]) return `FREQ=${ADVERBS[first]}`;
	if (rest.length === 0 && (first === "weekdays" || first === "weekends"))
		return `FREQ=WEEKLY;BYDAY=${first === "weekdays" ? WEEKDAYS : WEEKEND}`;
	if (first !== "every" || rest.length === 0) return null;

	// every [other | N] <unit>[s] [on <days>]
	let i = 0;
	let interval = 1;
	if (rest[i] === "other") {
		interval = 2;
		i++;
	} else if (/^\d+$/.test(rest[i]!)) {
		interval = Number(rest[i]);
		i++;
	}
	if (interval < 1 || interval > 1000) return null;
	const unit = rest[i]?.replace(/s$/, "");
	if (unit && UNITS[unit]) {
		const tail = rest.slice(i + 1);
		const base = `FREQ=${UNITS[unit]}${interval > 1 ? `;INTERVAL=${interval}` : ""}`;
		if (tail.length === 0) return base;
		if (unit !== "week" || tail[0] !== "on") return null;
		const days = dayList(tail.slice(1));
		return days ? `${base};BYDAY=${days}` : null;
	}
	if (interval !== 1) return null;
	const word = rest[i];
	if (word === "weekday" || word === "weekdays")
		return rest.length === i + 1 ? `FREQ=WEEKLY;BYDAY=${WEEKDAYS}` : null;
	if (word === "weekend" || word === "weekends")
		return rest.length === i + 1 ? `FREQ=WEEKLY;BYDAY=${WEEKEND}` : null;
	const days = dayList(rest.slice(i));
	return days ? `FREQ=WEEKLY;BYDAY=${days}` : null;
}

/** "mon and thu", "monday wednesday friday" → `MO,TH`; null if any word isn't a day. */
function dayList(words: string[]): string | null {
	const codes: string[] = [];
	for (const w of words) {
		if (w === "and" || w === "&") continue;
		const code = weekdayCode(w);
		if (!code) return null;
		if (!codes.includes(code)) codes.push(code);
	}
	if (!codes.length) return null;
	return codes.sort((a, b) => order(a) - order(b)).join(",");
}

/** Monday first, as people list days. */
const order = (code: string) =>
	(DAY_CODES.indexOf(code as (typeof DAY_CODES)[number]) + 6) % 7;

const pad = (n: number) => String(n).padStart(2, "0");

/** The rule's parts as a map, e.g. `{ FREQ: "WEEKLY", BYDAY: "MO,FR" }`. */
export function ruleParts(rrule: string): Record<string, string> {
	return Object.fromEntries(
		rrule
			.replace(/^RRULE:/i, "")
			.split(";")
			.filter(Boolean)
			.map((p) => p.split("=") as [string, string]),
	);
}

/**
 * The rule in words: "Every weekday at 09:00", "Every 2 weeks on Friday at 18:30", "Every 2 minutes". Rules it can't
 * word (BYSETPOS, BYMONTHDAY lists, …) read "Repeats (custom)".
 */
export function describeRepeat(rrule: string, time: TimeOfDay | null): string {
	const parts = ruleParts(rrule);
	const interval = Number(parts.INTERVAL ?? 1);
	const unit = Object.entries(UNITS).find(([, f]) => f === parts.FREQ)?.[0];
	const known = new Set([
		"FREQ",
		"INTERVAL",
		"BYDAY",
		"WKST",
		"UNTIL",
		"COUNT",
	]);
	if (!unit || Object.keys(parts).some((k) => !known.has(k)))
		return "Repeats (custom)";
	const subDaily = unit === "minute" || unit === "hour";
	const at =
		time && !subDaily ? ` at ${pad(time.hour)}:${pad(time.minute)}` : "";
	const days = parts.BYDAY;
	if (days && unit === "week") {
		if (interval === 1 && days === WEEKDAYS) return `Every weekday${at}`;
		if (interval === 1 && days === WEEKEND) return `Every weekend${at}`;
		const names = days
			.split(",")
			.map(
				(c) =>
					DAY_NAMES[DAY_CODES.indexOf(c as (typeof DAY_CODES)[number])] ?? c,
			);
		const list =
			names.length > 1
				? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
				: names[0];
		return `${interval > 1 ? `Every ${interval} weeks on` : "Every"} ${list}${at}`;
	}
	if (days) return "Repeats (custom)";
	return `Every ${interval > 1 ? `${interval} ${unit}s` : unit}${at}`;
}

/**
 * Whether the rule's frequency alone repeats more often than `minMinutes` (by the second, or every few minutes). What
 * words and pickers can say stops here; the API also checks a raw rule's real occurrences (BYMINUTE lists and the like).
 */
export function repeatsTooOften(
	rrule: string,
	minMinutes = MIN_REPEAT_MINUTES,
): boolean {
	const { FREQ, INTERVAL } = ruleParts(rrule);
	const minutes = FREQ === "SECONDLY" ? 1 / 60 : FREQ === "MINUTELY" ? 1 : null;
	return minutes !== null && Number(INTERVAL ?? 1) * minutes < minMinutes;
}

/** The repeats offered in pickers; `custom` lets a person type words or a rule. */
export const REPEAT_PRESETS = [
	{ id: "daily", label: "Every day", rrule: "FREQ=DAILY" },
	{
		id: "weekdays",
		label: "Every weekday",
		rrule: `FREQ=WEEKLY;BYDAY=${WEEKDAYS}`,
	},
	{ id: "weekly", label: "Every week", rrule: "FREQ=WEEKLY" },
	{ id: "biweekly", label: "Every 2 weeks", rrule: "FREQ=WEEKLY;INTERVAL=2" },
	{ id: "monthly", label: "Every month", rrule: "FREQ=MONTHLY" },
	{ id: "yearly", label: "Every year", rrule: "FREQ=YEARLY" },
] as const;

/** Rules that repeat within a day; the start time is the first run rather than a time of day. */
export const isSubDaily = (rrule: string) =>
	/FREQ=(MINUTELY|HOURLY|SECONDLY)/i.test(rrule);
