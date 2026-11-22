import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** The router's FORBIDDEN is the flag: this app's PostHog client has no organization group.
 * Do not probe `cloud.periods.list` instead: Billing reads it, so it is not gated. */
export function useCloudUsageEnabled(): boolean | undefined {
	const { isPending, error } = cloudTrpc.cloud.usage.query.useQuery(
		{ range: "24h", limit: 1 },
		{ staleTime: 5 * 60_000, refetchOnWindowFocus: false },
	);
	if (error) return error.data?.code !== "FORBIDDEN";
	return isPending ? undefined : true;
}
