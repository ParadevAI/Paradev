import { getActiveLocale } from "@superset/i18n/format";
import { zonedInstant } from "../scheduleForm";

/** "Pacific Time"; with `short`, "PT". */
export function zoneName(
	timezone: string,
	style: "long" | "short" = "long",
	at = new Date(),
): string {
	const part = new Intl.DateTimeFormat(getActiveLocale(), {
		timeZone: timezone,
		timeZoneName: style === "long" ? "longGeneric" : "shortGeneric",
	})
		.formatToParts(at)
		.find((p) => p.type === "timeZoneName");
	return part?.value ?? timezone;
}

/** "9:00 AM PT": a wall-clock time on `date` in the routine's time zone. */
export function clockLabel(time: string, date: string, timezone: string) {
	const at = zonedInstant(date, time, timezone);
	const clock = new Intl.DateTimeFormat(getActiveLocale(), {
		hour: "numeric",
		minute: "2-digit",
		timeZone: timezone,
	}).format(at);
	return `${clock} ${zoneName(timezone, "short", at)}`;
}

/** Every half hour of the day, plus `current` when it falls between them. */
export function timeChoices(current: string): string[] {
	const choices = Array.from({ length: 48 }, (_, i) => {
		const hour = String(Math.floor(i / 2)).padStart(2, "0");
		return `${hour}:${i % 2 ? "30" : "00"}`;
	});
	return choices.includes(current)
		? choices
		: [...choices, current].sort((a, b) => a.localeCompare(b));
}
