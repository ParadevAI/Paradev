import { useCallback, useEffect, useState } from "react";

const GIVE_UP_AFTER_MS = 2 * 60_000;

interface SourceRow {
	id: string;
	syncedAt: Date | string | null;
	syncError: string | null;
	updatedAt: Date | string;
}

const stamp = (value: Date | string) => new Date(value).getTime();

/** A source never synced, with no error yet, is still on its first sync. */
export function isFirstSyncPending(source: SourceRow): boolean {
	return source.syncedAt === null && source.syncError === null;
}

/**
 * Tracks syncs that run in the background after "Sync now" or "Add". A sync is
 * done when its source row is written again, or after a time limit.
 */
export function usePendingSourceSyncs(
	sources: readonly SourceRow[] | undefined,
	onFinished: () => void,
	now: () => number = Date.now,
) {
	const [requested, setRequested] = useState<
		Record<string, { updatedAt: number; at: number }>
	>({});

	const markRequested = useCallback(
		(source: SourceRow) =>
			setRequested((current) => ({
				...current,
				[source.id]: { updatedAt: stamp(source.updatedAt), at: now() },
			})),
		[now],
	);

	useEffect(() => {
		if (!sources) return;
		const finished = Object.entries(requested).filter(([id, request]) => {
			const source = sources.find((row) => row.id === id);
			return (
				!source ||
				stamp(source.updatedAt) !== request.updatedAt ||
				now() - request.at > GIVE_UP_AFTER_MS
			);
		});
		if (!finished.length) return;
		setRequested((current) => {
			const next = { ...current };
			for (const [id] of finished) delete next[id];
			return next;
		});
		onFinished();
	}, [sources, requested, onFinished, now]);

	const isPending = (id: string) =>
		id in requested ||
		Boolean(sources?.some((row) => row.id === id && isFirstSyncPending(row)));
	const anyPending =
		Object.keys(requested).length > 0 ||
		Boolean(sources?.some(isFirstSyncPending));

	return { markRequested, isPending, anyPending };
}
