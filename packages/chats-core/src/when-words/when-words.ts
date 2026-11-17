import {
	isTimeWord,
	parseTimeOfDay,
	type TimeOfDay,
	weekdayCode,
} from "../repeat-rule/repeat-rule.ts";

/**
 * A wall-clock moment with no zone: a local `YYYY-MM-DD` and a time of day. Callers bring "now" in whatever zone the
 * words were meant in (the device's for `/task`, `--tz` for the CLI), so the words read the same everywhere.
 */
export interface WallClock {
	date: string;
	time: TimeOfDay;
}

/** One when-word (or short phrase): a date, a time of day, or a span from now. */
export type WhenWord =
	| { kind: "date"; date: string }
	| { kind: "time"; time: TimeOfDay }
	| { kind: "in"; minutes: number };

/** When a phrase lands: a date, a time on a date, or a span from now. */
export type When =
	| { kind: "date"; date: string }
	| { kind: "time"; date: string; time: TimeOfDay }
	| { kind: "in"; minutes: number };

const SPAN_MINUTES: Record<string, number> = {
	minute: 1,
	min: 1,
	hour: 60,
	hr: 60,
	day: 24 * 60,
	week: 7 * 24 * 60,
};

function addDays(date: string, days: number): string {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** "fri" (or "next fri") is its next occurrence, never today: today is already "today". */
function nextWeekday(word: string, today: string): string | null {
	const code = weekdayCode(word);
	if (!code || word.endsWith("s")) return null;
	const weekday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].indexOf(code);
	const todayWeekday = new Date(`${today}T00:00:00Z`).getUTCDay();
	return addDays(today, (weekday - todayWeekday + 7) % 7 || 7);
}

/** "in 2 hours", "in a week": whole days stay dates, so "in 3 days" is a due date rather than a time. */
function span(
	count: string | undefined,
	unit: string | undefined,
	today: string,
): WhenWord | null {
	const n =
		count === "a" || count === "an"
			? 1
			: /^\d{1,4}$/.test(count ?? "")
				? Number(count)
				: null;
	const minutes = SPAN_MINUTES[unit?.replace(/s$/, "") ?? ""];
	if (!n || !minutes) return null;
	return minutes >= SPAN_MINUTES.day!
		? { kind: "date", date: addDays(today, (n * minutes) / SPAN_MINUTES.day!) }
		: { kind: "in", minutes: n * minutes };
}

/**
 * Reads the when-word starting at `words[i]`: "today", "tomorrow", "fri", "next fri", "at 9", "10am", "noon",
 * "in 2 hours". Returns it with the index after it, or null when `words[i]` doesn't start one.
 */
export function readWhenWord(
	words: string[],
	i: number,
	today: string,
): { word: WhenWord; end: number } | null {
	const [lower, next, third] = words
		.slice(i, i + 3)
		.map((w) => w.toLowerCase());
	if (lower === "today")
		return { word: { kind: "date", date: today }, end: i + 1 };
	if (lower === "tomorrow" || lower === "tmrw")
		return { word: { kind: "date", date: addDays(today, 1) }, end: i + 1 };
	const weekday = nextWeekday(lower ?? "", today);
	if (weekday) return { word: { kind: "date", date: weekday }, end: i + 1 };
	const nextDay = lower === "next" && next ? nextWeekday(next, today) : null;
	if (nextDay) return { word: { kind: "date", date: nextDay }, end: i + 2 };
	const at = lower === "at" && next ? parseTimeOfDay(next) : null;
	if (at) return { word: { kind: "time", time: at }, end: i + 2 };
	if (lower && isTimeWord(lower))
		return { word: { kind: "time", time: parseTimeOfDay(lower)! }, end: i + 1 };
	const inSpan = lower === "in" ? span(next, third, today) : null;
	if (inSpan) return { word: inSpan, end: i + 3 };
	return null;
}

const isAhead = (time: TimeOfDay, now: TimeOfDay) =>
	time.hour * 60 + time.minute > now.hour * 60 + now.minute;

/** The date a time falls on: the given one, else today if the time is still ahead, else tomorrow. */
export function timeDate(
	date: string | null,
	time: TimeOfDay,
	now: WallClock,
): string {
	return date ?? (isAhead(time, now.time) ? now.date : addDays(now.date, 1));
}

/**
 * Reads a whole when-phrase, as `/task` reads its when-words: "friday", "tomorrow 9am", "next monday at 10", "on fri at
 * noon", "in 2 hours". Null unless every word is part of it, so a typo is an error rather than a wrong date.
 */
export function parseWhen(text: string, now: WallClock): When | null {
	const words = text.trim().split(/\s+/).filter(Boolean);
	let date: string | null = null;
	let time: TimeOfDay | null = null;
	let minutes: number | null = null;
	for (let i = 0; i < words.length; ) {
		if (words[i]!.toLowerCase() === "on" && i + 1 < words.length) i++;
		const read = readWhenWord(words, i, now.date);
		if (!read) return null;
		const { word } = read;
		if (word.kind === "date" && date === null) date = word.date;
		else if (word.kind === "time" && time === null) time = word.time;
		else if (word.kind === "in" && minutes === null) minutes = word.minutes;
		else return null;
		i = read.end;
	}
	if (minutes !== null)
		return date === null && time === null ? { kind: "in", minutes } : null;
	if (time) return { kind: "time", date: timeDate(date, time, now), time };
	return date ? { kind: "date", date } : null;
}
