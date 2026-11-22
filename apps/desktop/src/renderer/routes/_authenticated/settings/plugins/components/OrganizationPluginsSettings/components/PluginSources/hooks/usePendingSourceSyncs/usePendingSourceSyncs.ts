import { useCallback, useEffect, useState } from "react";

export const SYNC_GIVE_UP_MS = 2 * 60_000;
const TICK_MS = 5_000;

export interface SourceRow {
	id: string;
	syncedAt: Date | string | null;
	syncError: string | null;
	createdAt: Date | string;
	updatedAt: Date | string;
}

export interface SyncRequest {
	updatedAt: number;
	at: number;
}

const stamp = (value: Date | string) => new Date(value).getTime();

export function isFirstSyncPending(source: SourceRow, now: number): boolean {
	return (
		source.syncedAt === null &&
		source.syncError === null &&
		now - stamp(source.createdAt) < SYNC_GIVE_UP_MS
	);
}

/** Requests that are done: their source row was written again, it is gone, or the time limit passed. */
export function finishedRequests(
	requested: Readonly<Record<string, SyncRequest>>,
	sources: readonly SourceRow[],
	now: number,
): string[] {
	return Object.entries(requested)
		.filter(([id, request]) => {
			const source = sources.find((row) => row.id === id);
			return (
				!source ||
				stamp(source.updatedAt) !== request.updatedAt ||
				now - request.at > SYNC_GIVE_UP_MS
			);
		})
		.map(([id]) => id);
}

/**
 * Tracks syncs that run in the background after "Sync now" or "Add". A clock
 * ticks while one is pending, so the time limit ends it even when the polled
 * rows do not change.
 */
export function usePendingSourceSyncs(
	sources: readonly SourceRow[] | undefined,
	onFinished: () => void,
	clock: () => number = Date.now,
) {
	const [requested, setRequested] = useState<Record<string, SyncRequest>>({});
	const [now, setNow] = useState(clock);

	const anyPending =
		Object.keys(requested).length > 0 ||
		Boolean(sources?.some((row) => isFirstSyncPending(row, now)));

	useEffect(() => {
		if (!anyPending) return;
		const timer = setInterval(() => setNow(clock()), TICK_MS);
		return () => clearInterval(timer);
	}, [anyPending, clock]);

	const markRequested = useCallback(
		(source: SourceRow) => {
			const at = clock();
			setNow(at);
			setRequested((current) => ({
				...current,
				[source.id]: { updatedAt: stamp(source.updatedAt), at },
			}));
		},
		[clock],
	);

	useEffect(() => {
		if (!sources) return;
		const finished = finishedRequests(requested, sources, now);
		if (!finished.length) return;
		setRequested((current) => {
			const next = { ...current };
			for (const id of finished) delete next[id];
			return next;
		});
		onFinished();
	}, [sources, requested, onFinished, now]);

	const isPending = (id: string) =>
		id in requested ||
		Boolean(
			sources?.some((row) => row.id === id && isFirstSyncPending(row, now)),
		);

	return { markRequested, isPending, anyPending };
}
