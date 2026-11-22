import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * The cloud usage flag is evaluated for the organization on the server, and
 * this app's PostHog client has no organization group, so the router's answer
 * is the flag: off, every cloud.* procedure is FORBIDDEN. Any other error
 * leaves the pages reachable, so they can show it and offer a retry.
 */
export function useCloudUsageEnabled(): boolean {
	const { isSuccess, error } = cloudTrpc.cloud.periods.list.useQuery(
		{ limit: 1 },
		{ staleTime: 5 * 60_000, refetchOnWindowFocus: false },
	);
	return isSuccess || (error !== null && error.data?.code !== "FORBIDDEN");
}
