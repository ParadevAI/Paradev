import {
	describeRepeat,
	isSubDaily,
	isTimeWord,
	MORNING,
	parseRepeat,
	parseTimeOfDay,
	REPEAT_TOO_OFTEN,
	type RepeatRule,
	repeatsTooOften,
	type TimeOfDay,
	weekdayCode,
} from "../repeat-rule/repeat-rule.ts";
import { firstRepeatDay } from "../repeat-start/repeat-start.ts";
import { readWhenWord, timeDate } from "../when-words/when-words.ts";

/** A repeat as sent to the API: the rule, the creator's time zone, and the first occurrence's local start (ISO). */
export interface RepeatDraft {
	rrule: string;
	timezone: string;
	dtstart: string;
}

export interface TaskDraft {
	title: string;
	/**
	 * Who does it as written: `me`, a lower-cased `@name`, or a mention token (`<@dev:id>`, `<@user:id>`). Resolving it
	 * is the caller's job; null leaves it to the chat's default.
	 */
	assignee: string | null;
	due: string | null;
	/** A time (ISO) when one was written: "tomorrow 10am", "at 9". */
	scheduledAt: string | null;
	/** "remind me": the time is a reminder rather than when a Dev starts. */
	remind: boolean;
	repeat: RepeatDraft | null;
	/** Why the draft can't be sent as written (a repeat more often than hourly), for the composer to show; else null. */
	error: string | null;
}

const MENTION = /^<@(dev|user):[0-9a-f-]{36}>$/i;
const REPEAT_START =
	/^(every|daily|weekly|monthly|yearly|annually|hourly|weekdays|weekends)$/;
/** Words that may continue an "every …" phrase. */
const REPEAT_WORD =
	/^(\d+|other|and|&|on|minutes?|hours?|days?|weeks?|months?|years?|weekdays?|weekends?)$/;

/** The device's time zone, which the creator's repeats keep their wall-clock time in. */
export const localTimeZone = () =>
	Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Parses `/task Book flights @me thu 10am`, `/task Standup notes every weekday at 9` or `/task Call mom remind me
 * tomorrow 6pm` into a draft. Returns `null` when the text isn't a task command, so the composer can send it as a normal
 * message. Tokens may appear in any order; the rest is the title. Times are the sender's local time.
 */
export function parseTaskCommand(
	text: string,
	now: Date,
	timeZone: string = localTimeZone(),
): TaskDraft | null {
	const match = /^\/task\s+(.+)$/is.exec(text.trim());
	if (!match?.[1]) return null;

	let assignee: string | null = null;
	let due: string | null = null;
	let time: TimeOfDay | null = null;
	let inMinutes: number | null = null;
	let remind = false;
	let repeat: RepeatRule | null = null;
	const titleWords: string[] = [];

	const words = match[1].split(/\s+/);
	const today = toDateString(now);
	for (let i = 0; i < words.length; i++) {
		const word = words[i]!;
		const lower = word.toLowerCase();
		const next = words[i + 1]?.toLowerCase();

		if (!repeat && REPEAT_START.test(lower)) {
			const phrase = repeatPhrase(words, i);
			if (phrase) {
				repeat = phrase.rule;
				i = phrase.end - 1;
				continue;
			}
		}
		const rawRule: RepeatRule | null =
			!repeat && /^(rrule:)?freq=/.test(lower) ? parseRepeat(word) : null;
		if (rawRule) repeat = rawRule;
		else if (MENTION.test(word)) assignee = word;
		else if (lower.startsWith("@") && lower.length > 1)
			assignee = lower.slice(1);
		else if (lower === "remind" || lower === "reminder") {
			remind = true;
			if (next === "me") i++;
		} else {
			const when = readWhenWord(words, i, today);
			if (!when) titleWords.push(word);
			else {
				if (when.word.kind === "date") due = when.word.date;
				else if (when.word.kind === "time") time = when.word.time;
				else inMinutes = when.word.minutes;
				i = when.end - 1;
			}
		}
	}

	const title = titleWords.join(" ").trim();
	if (!title) return null;

	if (repeat) {
		const start = repeatStart(repeat, time, due, now).toISOString();
		const error = repeatsTooOften(repeat.rrule) ? REPEAT_TOO_OFTEN : null;
		return {
			title,
			assignee,
			due: null,
			scheduledAt: start,
			remind,
			repeat: { rrule: repeat.rrule, timezone: timeZone, dtstart: start },
			error,
		};
	}
	if (inMinutes !== null)
		return {
			title,
			assignee,
			due: null,
			scheduledAt: new Date(now.getTime() + inMinutes * 60_000).toISOString(),
			remind,
			repeat: null,
			error: null,
		};
	if (time) {
		const at = localDateTime(
			timeDate(due, time, { date: today, time: timeOfDay(now) }),
			time,
		);
		return {
			title,
			assignee,
			due: null,
			scheduledAt: at.toISOString(),
			remind,
			repeat: null,
			error: null,
		};
	}
	return {
		title,
		assignee,
		due,
		scheduledAt: null,
		remind,
		repeat: null,
		error: null,
	};
}

/** The longest run of words from `start` that reads as a repeat ("every 2 weeks on fri at 9"). */
function repeatPhrase(words: string[], start: number) {
	let end = start + 1;
	const isPart = (w: string, prev: string) =>
		REPEAT_WORD.test(w) ||
		weekdayCode(w) !== null ||
		(prev === "at" ? parseTimeOfDay(w) !== null : w === "at" || isTimeWord(w));
	while (
		end < words.length &&
		isPart(
			words[end]!.toLowerCase().replace(/,$/, ""),
			words[end - 1]!.toLowerCase(),
		)
	)
		end++;
	// Back off word by word until what's left parses ("every day at" → "every day").
	for (let stop = end; stop > start; stop--) {
		const rule = parseRepeat(words.slice(start, stop).join(" "));
		if (rule) return { rule, end: stop };
	}
	return null;
}

/**
 * When a repeat starts: at its time, the command's time, or 9:00, on the given date (else today) or the rule's first day
 * after it that hasn't passed; sub-daily rules start at the next whole minute unless given a time.
 */
function repeatStart(
	repeat: { rrule: string; time: TimeOfDay | null },
	time: TimeOfDay | null,
	due: string | null,
	now: Date,
): Date {
	if (!repeat.time && !time && isSubDaily(repeat.rrule)) {
		const next = new Date(now);
		next.setSeconds(0, 0);
		next.setMinutes(next.getMinutes() + 1);
		return next;
	}
	const at = repeat.time ?? time ?? MORNING;
	return localDateTime(
		firstRepeatDay(repeat.rrule, due ?? toDateString(now), at, {
			date: toDateString(now),
			time: timeOfDay(now),
		}),
		at,
	);
}

/** Local `YYYY-MM-DD`, not UTC: a task due "today" must not shift a day for people east or west of UTC. */
export function toDateString(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A moment's wall-clock time in the device's zone. */
export const timeOfDay = (date: Date): TimeOfDay => ({
	hour: date.getHours(),
	minute: date.getMinutes(),
});

/** A local `YYYY-MM-DD` at a wall-clock time, in the device's zone. */
export function localDateTime(date: string, { hour, minute }: TimeOfDay): Date {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y!, m! - 1, d!, hour, minute);
}

/** A draft's repeat in words, at its first start's local time: "Every weekday at 09:00", "Every 2 hours". */
export function draftRepeatText({ rrule, dtstart }: RepeatDraft): string {
	const start = new Date(dtstart);
	return describeRepeat(rrule, isSubDaily(rrule) ? null : timeOfDay(start));
}
