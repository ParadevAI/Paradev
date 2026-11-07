import {
	hashKey,
	type QueryClient,
	type QueryKey,
} from "@tanstack/react-query";

const pendingByClient = new WeakMap<QueryClient, Set<string>>();

/**
 * Cancels any fetch in flight and refetches, so the data that settles was read
 * after the caller's event. Every observer of a query hears the same event in
 * one task; calls for the same key in that task share a single refetch.
 */
export function refreshQuery(queryClient: QueryClient, queryKey: QueryKey) {
	let pending = pendingByClient.get(queryClient);
	if (!pending) {
		pending = new Set();
		pendingByClient.set(queryClient, pending);
	}
	const hash = hashKey(queryKey);
	if (pending.has(hash)) return;
	pending.add(hash);
	queueMicrotask(() => {
		pending.delete(hash);
		void queryClient
			.cancelQueries({ queryKey })
			.then(() => queryClient.invalidateQueries({ queryKey }));
	});
}
