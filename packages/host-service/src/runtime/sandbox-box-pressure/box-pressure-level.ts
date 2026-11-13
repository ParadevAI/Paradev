import type { BoxPressure, BoxResource } from "@superset/shared/box-pressure";
import type { BoxResources } from "../box-resources";

/** Enter at the first number, leave below the second, so a box at the edge doesn't flicker. */
export const BOX_PRESSURE_THRESHOLDS = {
	cpuBusy: { enter: 40, exit: 25 },
	memoryBusy: { enter: 5, exit: 2 },
	memoryCritical: { enter: 30, exit: 15 },
} as const;

/** A level holds at least this long before it steps down. */
export const BOX_PRESSURE_MIN_DWELL_MS = 60_000;

export interface BoxPressureState {
	pressure: BoxPressure | null;
	since: number;
}

function limited(
	value: number,
	threshold: { enter: number; exit: number },
	wasLimited: boolean,
): boolean {
	return value >= (wasLimited ? threshold.exit : threshold.enter);
}

/** The next reported state from one sample. Rising is immediate; falling waits out the dwell. */
export function nextBoxPressure(
	previous: BoxPressureState,
	sample: BoxResources,
	now: number,
): BoxPressureState {
	const was = previous.pressure;
	const cpu = limited(
		sample.cpuWaitingPercent,
		BOX_PRESSURE_THRESHOLDS.cpuBusy,
		was?.limitedBy.includes("cpu") ?? false,
	);
	const memoryStalled = limited(
		sample.memoryStalledPercent,
		BOX_PRESSURE_THRESHOLDS.memoryBusy,
		was?.limitedBy.includes("memory") ?? false,
	);
	const memoryCritical = limited(
		sample.memoryStalledNowPercent,
		BOX_PRESSURE_THRESHOLDS.memoryCritical,
		was?.level === "critical",
	);
	const critical = sample.recentReap !== null || memoryCritical;
	const limitedBy: BoxResource[] = [];
	if (cpu) limitedBy.push("cpu");
	if (critical || memoryStalled) limitedBy.push("memory");

	const level = critical ? "critical" : limitedBy.length > 0 ? "busy" : null;
	const rank = (value: typeof level) =>
		value === "critical" ? 2 : value === "busy" ? 1 : 0;
	const falling = rank(level) < rank(was?.level ?? null);
	if (falling && now - previous.since < BOX_PRESSURE_MIN_DWELL_MS) {
		return previous;
	}

	const pressure: BoxPressure | null = level
		? {
				level,
				limitedBy,
				reap:
					sample.recentReap ??
					(level === "critical" ? (was?.reap ?? null) : null),
				at: now,
			}
		: null;
	const changed =
		pressure?.level !== was?.level ||
		pressure?.limitedBy.join() !== was?.limitedBy.join() ||
		pressure?.reap?.at !== was?.reap?.at;
	return { pressure, since: changed ? now : previous.since };
}
