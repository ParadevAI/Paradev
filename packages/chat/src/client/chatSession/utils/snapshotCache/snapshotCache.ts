import type { SessionSnapshot } from "../../../../core";

const MAX_CACHED_SNAPSHOTS = 5;

const snapshots = new Map<string, SessionSnapshot>();
const primed = new Set<string>();

export function cachedSnapshot(sessionId: string): SessionSnapshot | undefined {
	return snapshots.get(sessionId);
}

export function cacheSnapshot(
	sessionId: string,
	snapshot: SessionSnapshot,
): void {
	primed.delete(sessionId);
	snapshots.delete(sessionId);
	snapshots.set(sessionId, snapshot);
	for (const oldest of snapshots.keys()) {
		if (snapshots.size <= MAX_CACHED_SNAPSHOTS) break;
		snapshots.delete(oldest);
		primed.delete(oldest);
	}
}

/** A whole outline, fresh from the host: the next mount seeds from it instead of fetching. */
export function primeSnapshot(
	sessionId: string,
	snapshot: SessionSnapshot,
): void {
	cacheSnapshot(sessionId, snapshot);
	primed.add(sessionId);
}

export function takePrimedSnapshot(
	sessionId: string,
): SessionSnapshot | undefined {
	if (!primed.delete(sessionId)) return undefined;
	return snapshots.get(sessionId);
}

export function forgetSnapshot(sessionId: string): void {
	snapshots.delete(sessionId);
	primed.delete(sessionId);
}
