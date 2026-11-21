import type { QueryClient } from "@tanstack/react-query";

// Scoped to the cache, not a component: a remounted list must still reject
// a reply that an unmounted instance started.
const latestRequestByClient = new WeakMap<QueryClient, Map<string, number>>();
let nextRequestId = 0;

/** Marks a row-details request as the newest for its page; its reply may write only while it still is. */
export function startRowDetailsRequest(
	queryClient: QueryClient,
	requestKey: string,
): { isLatest: () => boolean; finish: () => void } {
	const latest =
		latestRequestByClient.get(queryClient) ?? new Map<string, number>();
	latestRequestByClient.set(queryClient, latest);
	nextRequestId += 1;
	const requestId = nextRequestId;
	latest.set(requestKey, requestId);
	const isLatest = () => latest.get(requestKey) === requestId;
	return {
		isLatest,
		finish: () => {
			if (isLatest()) latest.delete(requestKey);
		},
	};
}
