export interface ZonedParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	/** 0 is Sunday. */
	weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			weekday: "short",
		});
		formatters.set(timeZone, formatter);
	}
	return formatter;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The wall-clock reading of an instant in a zone. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
	const parts = Object.fromEntries(
		formatterFor(timeZone)
			.formatToParts(instant)
			.map((part) => [part.type, part.value]),
	);
	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour: Number(parts.hour),
		minute: Number(parts.minute),
		weekday: WEEKDAYS.indexOf(parts.weekday ?? "Sun"),
	};
}

const GAP_STEP_MS = 15 * 60_000;
const GAP_STEPS_MAX = 12;

function asUtc(
	wall: Pick<ZonedParts, "year" | "month" | "day" | "hour" | "minute">,
) {
	return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

/** The instant a wall-clock reading names in a zone. A reading a clock change skips lands on the first moment after the gap. */
export function zonedInstant(
	wall: Pick<ZonedParts, "year" | "month" | "day" | "hour" | "minute">,
	timeZone: string,
): Date {
	const wanted = asUtc(wall);
	let guess = wanted;
	for (let pass = 0; pass < 3; pass++) {
		const seen = asUtc(zonedParts(new Date(guess), timeZone));
		if (seen === wanted) return new Date(guess);
		guess += wanted - seen;
	}
	for (
		let step = 0;
		step < GAP_STEPS_MAX &&
		asUtc(zonedParts(new Date(guess), timeZone)) < wanted;
		step++
	) {
		guess += GAP_STEP_MS;
	}
	return new Date(guess);
}

/** The first moment of the day `instant` falls in, in the zone, moved by whole calendar days. */
export function startOfZonedDay(
	instant: Date,
	timeZone: string,
	addDays = 0,
): Date {
	const { year, month, day } = zonedParts(instant, timeZone);
	const moved = new Date(Date.UTC(year, month - 1, day + addDays));
	return zonedInstant(
		{
			year: moved.getUTCFullYear(),
			month: moved.getUTCMonth() + 1,
			day: moved.getUTCDate(),
			hour: 0,
			minute: 0,
		},
		timeZone,
	);
}
