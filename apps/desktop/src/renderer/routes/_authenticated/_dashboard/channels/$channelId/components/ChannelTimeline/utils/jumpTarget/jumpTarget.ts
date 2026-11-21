export type JumpOption =
	| "today"
	| "yesterday"
	| "last-week"
	| "last-month"
	| "beginning";

export function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The start of the day a jump lands on; null means the very beginning. */
export function jumpTarget(option: JumpOption, now: Date): Date | null {
	const today = startOfDay(now);
	switch (option) {
		case "today":
			return today;
		case "yesterday":
			return new Date(
				today.getFullYear(),
				today.getMonth(),
				today.getDate() - 1,
			);
		case "last-week":
			return new Date(
				today.getFullYear(),
				today.getMonth(),
				today.getDate() - 7,
			);
		case "last-month":
			return new Date(
				today.getFullYear(),
				today.getMonth() - 1,
				today.getDate(),
			);
		case "beginning":
			return null;
	}
}
