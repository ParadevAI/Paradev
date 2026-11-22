import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useSyncExternalStore } from "react";

const EMPTY: readonly never[] = [];

export function readQueryCacheData<T>(
	queryClient: QueryClient,
	keyPrefix: readonly unknown[],
): T[] {
	const data: T[] = [];
	for (const [, value] of queryClient.getQueriesData<T>({
		queryKey: keyPrefix,
	})) {
		if (value !== undefined) data.push(value);
	}
	return data;
}

function hasPrefix(key: readonly unknown[], prefix: readonly unknown[]) {
	return prefix.every((part, index) => key[index] === part);
}

/**
 * The data of every cached query under `keyPrefix`, kept current without
 * observing or fetching them: for a reader that shows what another part of
 * the app already loads. Empty while `enabled` is false. `keyPrefix` must be
 * a stable reference.
 */
export function useQueryCacheData<T>(
	keyPrefix: readonly unknown[],
	enabled = true,
): readonly T[] {
	const queryClient = useQueryClient();
	const snapshot = useRef<readonly T[]>(EMPTY);

	const subscribe = useCallback(
		(onChange: () => void) => {
			if (!enabled) return () => {};
			return queryClient.getQueryCache().subscribe((event) => {
				// `added` fires inside the render that first builds a query, and
				// notifying React there is a render-phase update.
				if (event.type !== "updated" && event.type !== "removed") return;
				if (hasPrefix(event.query.queryKey, keyPrefix)) onChange();
			});
		},
		[queryClient, keyPrefix, enabled],
	);

	return useSyncExternalStore(subscribe, () => {
		if (!enabled) return EMPTY;
		// React Query keeps a query's data reference while its content is
		// unchanged, so comparing references is enough.
		const data = readQueryCacheData<T>(queryClient, keyPrefix);
		const previous = snapshot.current;
		const unchanged =
			data.length === previous.length &&
			data.every((item, index) => item === previous[index]);
		if (!unchanged) snapshot.current = data;
		return snapshot.current;
	});
}
