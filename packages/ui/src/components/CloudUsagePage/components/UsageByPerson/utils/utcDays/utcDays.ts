const DAY_MS = 24 * 60 * 60 * 1000;

/** Every UTC day (YYYY-MM-DD) that the window touches. */
export function utcDays(window: { from: Date; to: Date }): string[] {
	const days: string[] = [];
	const start = Math.floor(window.from.getTime() / DAY_MS) * DAY_MS;
	for (let day = start; day < window.to.getTime(); day += DAY_MS) {
		days.push(new Date(day).toISOString().slice(0, 10));
	}
	return days;
}
