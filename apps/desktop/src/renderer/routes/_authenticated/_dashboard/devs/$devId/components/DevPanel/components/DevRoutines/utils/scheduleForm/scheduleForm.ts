import type { RoutineSchedule } from "@superset/shared/agent-routines";

export type RepeatEvery =
	| "interval"
	| "daily"
	| "weekdays"
	| "weekly"
	| "monthly"
	| "custom";

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface ScheduleForm {
	repeat: boolean;
	every: RepeatEvery;
	/** The first run's day, YYYY-MM-DD, in `timezone`. */
	date: string;
	/** HH:MM in `timezone`. */
	time: string;
	intervalHours: number;
	weekday: Weekday;
	monthDay: number;
	/** The last day it may run, YYYY-MM-DD, or null to repeat forever. */
	endDate: string | null;
	customRule: string;
	timezone: string;
}

/** The wall-clock date and time of an instant in a time zone. */
function wallClock(date: Date, timezone: string) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-CA", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
			weekday: "short",
		})
			.formatToParts(date)
			.map((part) => [part.type, part.value]),
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		time: `${parts.hour}:${parts.minute}`,
		weekday: (parts.weekday ?? "Mon").slice(0, 2).toUpperCase() as Weekday,
		monthDay: Number(parts.day),
	};
}

/** The instant a wall-clock date and time in a time zone stands for. */
export function zonedInstant(date: string, time: string, timezone: string) {
	const [y = 1970, mo = 1, d = 1] = date.split("-").map(Number);
	const [h = 0, mi = 0] = time.split(":").map(Number);
	const asUtc = Date.UTC(y, mo - 1, d, h, mi);
	let guess = asUtc;
	for (let i = 0; i < 2; i++) {
		const seen = wallClock(new Date(guess), timezone);
		const [sy = 1970, smo = 1, sd = 1] = seen.date.split("-").map(Number);
		const [sh = 0, smi = 0] = seen.time.split(":").map(Number);
		guess += asUtc - Date.UTC(sy, smo - 1, sd, sh, smi);
	}
	return new Date(guess);
}

function ruleParts(rule: string): Map<string, string> {
	return new Map(
		rule
			.split(";")
			.map((part) => part.split("=") as [string, string])
			.filter(([key, value]) => key && value !== undefined)
			.map(([key, value]) => [key.toUpperCase(), value.toUpperCase()]),
	);
}

function untilDate(until: string | undefined, timezone: string) {
	const match = until?.match(/^(\d{4})(\d{2})(\d{2})/);
	if (!match) return null;
	const instant = new Date(
		`${match[1]}-${match[2]}-${match[3]}T${until?.slice(9, 11) || "23"}:${until?.slice(11, 13) || "59"}:00Z`,
	);
	return wallClock(instant, timezone).date;
}

export function formFromSchedule(
	schedule: RoutineSchedule | null,
	fallback: { now: Date; timezone: string },
): ScheduleForm {
	const timezone = schedule?.timezone ?? fallback.timezone;
	const start = schedule ? new Date(schedule.dtstart) : fallback.now;
	const clock = wallClock(start, timezone);
	const base: ScheduleForm = {
		repeat: Boolean(schedule?.rrule),
		every: "daily",
		date: clock.date,
		time: clock.time,
		intervalHours: 1,
		weekday: clock.weekday,
		monthDay: clock.monthDay,
		endDate: null,
		customRule: schedule?.rrule ?? "",
		timezone,
	};
	if (!schedule?.rrule) return base;
	const parts = ruleParts(schedule.rrule);
	const known = new Set([
		"FREQ",
		"INTERVAL",
		"BYDAY",
		"BYMONTHDAY",
		"BYHOUR",
		"BYMINUTE",
		"BYSECOND",
		"UNTIL",
	]);
	const endDate = untilDate(parts.get("UNTIL"), timezone);
	const freq = parts.get("FREQ");
	const byDay = parts.get("BYDAY");
	const custom = { ...base, every: "custom" as const, endDate: null };
	if ([...parts.keys()].some((key) => !known.has(key))) return custom;
	const withEnd = { ...base, endDate };
	if (freq === "HOURLY") {
		return {
			...withEnd,
			every: "interval",
			intervalHours: Number(parts.get("INTERVAL") ?? 1),
		};
	}
	if (freq === "DAILY" && !byDay) return { ...withEnd, every: "daily" };
	if (freq === "WEEKLY" && byDay === "MO,TU,WE,TH,FR") {
		return { ...withEnd, every: "weekdays" };
	}
	if (freq === "WEEKLY" && byDay && WEEKDAYS.includes(byDay as Weekday)) {
		return { ...withEnd, every: "weekly", weekday: byDay as Weekday };
	}
	if (freq === "MONTHLY" && parts.get("BYMONTHDAY")) {
		return {
			...withEnd,
			every: "monthly",
			monthDay: Number(parts.get("BYMONTHDAY")),
		};
	}
	return custom;
}

export function scheduleFromForm(form: ScheduleForm): RoutineSchedule {
	const dtstart = zonedInstant(form.date, form.time, form.timezone);
	if (!form.repeat) {
		return {
			dtstart: dtstart.toISOString(),
			rrule: null,
			timezone: form.timezone,
		};
	}
	const [hour = 0, minute = 0] = form.time.split(":").map(Number);
	const at = `BYHOUR=${hour};BYMINUTE=${minute}`;
	const rule = {
		interval: `FREQ=HOURLY;INTERVAL=${Math.max(1, Math.round(form.intervalHours))};BYMINUTE=${minute}`,
		daily: `FREQ=DAILY;${at}`,
		weekdays: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;${at}`,
		weekly: `FREQ=WEEKLY;BYDAY=${form.weekday};${at}`,
		monthly: `FREQ=MONTHLY;BYMONTHDAY=${form.monthDay};${at}`,
		custom: form.customRule.trim(),
	}[form.every];
	const until =
		form.endDate && form.every !== "custom"
			? `;UNTIL=${zonedInstant(form.endDate, "23:59", form.timezone)
					.toISOString()
					.replace(/[-:]/g, "")
					.replace(/\.\d{3}/, "")}`
			: "";
	return {
		dtstart: dtstart.toISOString(),
		rrule: `${rule}${until}`,
		timezone: form.timezone,
	};
}

/** The rule without its end, for describing the cadence alone. */
export function cadenceOf(rule: string): string {
	return rule
		.split(";")
		.filter((part) => !/^(UNTIL|COUNT)=/i.test(part))
		.join(";");
}
