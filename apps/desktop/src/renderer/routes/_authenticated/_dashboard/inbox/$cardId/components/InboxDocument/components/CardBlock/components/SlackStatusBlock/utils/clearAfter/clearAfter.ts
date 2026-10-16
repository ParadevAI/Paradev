import { tomorrowMorning } from "../../../../utils/slackWhen";
import {
	addDays,
	dayOf,
	MINUTE_MS,
	zonedInstant,
} from "../../../../utils/zoneTime";

export const CLEAR_CHOICES = [
	"never",
	"30m",
	"1h",
	"4h",
	"today",
	"week",
	"custom",
] as const;
export type ClearChoice = (typeof CLEAR_CHOICES)[number];

export const PAUSE_CHOICES = ["30m", "1h", "2h", "tomorrow", "custom"] as const;
export type PauseChoice = (typeof PAUSE_CHOICES)[number];

const MINUTES = { "30m": 30, "1h": 60, "2h": 120, "4h": 240 } as const;
const MONDAY = 1;
const WEEK_DAYS = 7;

const minutesFrom = (now: number, minutes: number) =>
	Math.ceil(now / MINUTE_MS) * MINUTE_MS + minutes * MINUTE_MS;

const endOfToday = (now: number, timeZone: string) =>
	zonedInstant(addDays(dayOf(now, timeZone), 1), 0, timeZone);

function endOfWeek(now: number, timeZone: string): number {
	const today = dayOf(now, timeZone);
	const weekday = new Date(
		Date.UTC(today.year, today.month - 1, today.day),
	).getUTCDay();
	const ahead = (MONDAY - weekday + WEEK_DAYS) % WEEK_DAYS || WEEK_DAYS;
	return zonedInstant(addDays(today, ahead), 0, timeZone);
}

/** When a status clears for a choice of Slack's "Duration"; null never clears. */
export function clearTime(
	choice: ClearChoice,
	custom: number,
	now: number,
	timeZone: string,
): number | null {
	if (choice === "never") return null;
	if (choice === "custom") return custom;
	if (choice === "today") return endOfToday(now, timeZone);
	if (choice === "week") return endOfWeek(now, timeZone);
	return minutesFrom(now, MINUTES[choice]);
}

/** The choice a proposed time stands for; a time that is no preset is the reader's own date and time. */
export function clearChoiceOf(
	until: number | null,
	now: number,
	timeZone: string,
): ClearChoice {
	if (until === null) return "never";
	if (until === endOfToday(now, timeZone)) return "today";
	if (until === endOfWeek(now, timeZone)) return "week";
	return "custom";
}

export function pauseTime(
	choice: PauseChoice,
	custom: number,
	now: number,
	timeZone: string,
): number {
	if (choice === "custom") return custom;
	if (choice === "tomorrow") return tomorrowMorning(now, timeZone);
	return minutesFrom(now, MINUTES[choice]);
}

export function pauseChoiceOf(
	until: number | null,
	now: number,
	timeZone: string,
): PauseChoice {
	if (until === null) return "30m";
	return until === tomorrowMorning(now, timeZone) ? "tomorrow" : "custom";
}
