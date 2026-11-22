import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * The cloud usage flag is evaluated for the organization on the server, and
 * this app's PostHog client has no organization group, so the router's answer
 * is the flag: off, `cloud.usage.query` is FORBIDDEN. `cloud.periods.list`
 * is not gated (Billing reads it), so it cannot be the probe. Any other error
 * leaves the pages reachable, so they can show it and offer a retry.
 */
export function useCloudUsageEnabled(): boolean {
	const { isSuccess, error } = cloudTrpc.cloud.usage.query.useQuery(
		{ range: "24h", limit: 1 },
		{ staleTime: 5 * 60_000, refetchOnWindowFocus: false },
	);
	return isSuccess || (error !== null && error.data?.code !== "FORBIDDEN");
}
