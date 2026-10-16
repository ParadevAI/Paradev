import type { LinearCycleView } from "../../../../types";
import { nextCycle } from "../../../../utils/linearFields";

export type SnoozeChoice = "hour" | "tomorrow" | "week" | "month" | "cycle";

const HOUR_MS = 60 * 60 * 1000;
const MORNING = 9;

/** Linear's snooze times, in the reader's own zone: mornings are 9:00, and next week is its Monday. */
export function snoozeTimes(
	now: Date,
	cycles: readonly LinearCycleView[],
): { id: SnoozeChoice; at: Date }[] {
	const morning = (months: number, days: number) =>
		new Date(
			now.getFullYear(),
			now.getMonth() + months,
			now.getDate() + days,
			MORNING,
		);
	const toMonday = (8 - now.getDay()) % 7 || 7;
	const cycle = nextCycle(cycles, now.getTime());
	return [
		{ id: "hour", at: new Date(now.getTime() + HOUR_MS) },
		{ id: "tomorrow", at: morning(0, 1) },
		{ id: "week", at: morning(0, toMonday) },
		{ id: "month", at: morning(1, 0) },
		...(cycle ? [{ id: "cycle" as const, at: new Date(cycle.startsAt) }] : []),
	];
}
