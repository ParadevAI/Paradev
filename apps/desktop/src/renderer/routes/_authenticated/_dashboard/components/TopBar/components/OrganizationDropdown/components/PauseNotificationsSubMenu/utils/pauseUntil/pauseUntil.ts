export type PauseOption = "30m" | "1h" | "2h" | "tomorrow";

const TOMORROW_HOUR = 9;

/** When a pause from `now` ends; "tomorrow" is 9:00 the next day, local time. */
export function pauseUntil(option: PauseOption, now: Date): Date {
	switch (option) {
		case "30m":
			return new Date(now.getTime() + 30 * 60_000);
		case "1h":
			return new Date(now.getTime() + 60 * 60_000);
		case "2h":
			return new Date(now.getTime() + 2 * 60 * 60_000);
		case "tomorrow":
			return new Date(
				now.getFullYear(),
				now.getMonth(),
				now.getDate() + 1,
				TOMORROW_HOUR,
			);
	}
}
