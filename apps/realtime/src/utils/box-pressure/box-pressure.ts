import {
	BOX_PRESSURE_TTL_MS,
	type BoxPressure,
} from "@superset/shared/box-pressure";

export type BoxPressureMap = Record<string, BoxPressure>;

function sameState(a: BoxPressure | undefined, b: BoxPressure | null): boolean {
	if (!a || !b) return !a && !b;
	return (
		a.level === b.level &&
		a.limitedBy.join() === b.limitedBy.join() &&
		a.reap?.at === b.reap?.at
	);
}

/**
 * Records one box's report. `changed` is false for a heartbeat that only
 * refreshes the timestamp, which windows don't need to hear about.
 */
export function applyBoxPressure(
	map: BoxPressureMap,
	workspaceId: string,
	pressure: BoxPressure | null,
): { map: BoxPressureMap; changed: boolean } {
	const changed = !sameState(map[workspaceId], pressure);
	const next = { ...map };
	if (pressure) next[workspaceId] = pressure;
	else delete next[workspaceId];
	return { map: next, changed };
}

/** Drops boxes that stopped reporting: a box under pressure re-reports well inside the TTL. */
export function sweepBoxPressure(
	map: BoxPressureMap,
	now: number,
	ttlMs = BOX_PRESSURE_TTL_MS,
): { map: BoxPressureMap; expired: string[]; nextExpiryAt: number | null } {
	const next: BoxPressureMap = {};
	const expired: string[] = [];
	let nextExpiryAt: number | null = null;
	for (const [workspaceId, pressure] of Object.entries(map)) {
		const expiresAt = pressure.at + ttlMs;
		if (expiresAt <= now) {
			expired.push(workspaceId);
			continue;
		}
		next[workspaceId] = pressure;
		nextExpiryAt =
			nextExpiryAt === null ? expiresAt : Math.min(nextExpiryAt, expiresAt);
	}
	return { map: next, expired, nextExpiryAt };
}
