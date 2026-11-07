import type { QueryFunctionContext } from "@tanstack/react-query";

/**
 * Query function for a host-keyed query whose host may be unreachable.
 *
 * Every observer of a shared key sets the query's options, and an
 * invalidation runs the last ones set, even a disabled observer's. With no
 * URL there is no queryFn, so react-query borrows a reachable observer's
 * instead of storing an empty answer over the cache.
 */
export function hostQueryFn<T>(
	hostUrl: string | null,
	load: (hostUrl: string, context: QueryFunctionContext) => Promise<T>,
): ((context: QueryFunctionContext) => Promise<T>) | undefined {
	if (!hostUrl) return undefined;
	return (context) => load(hostUrl, context);
}
