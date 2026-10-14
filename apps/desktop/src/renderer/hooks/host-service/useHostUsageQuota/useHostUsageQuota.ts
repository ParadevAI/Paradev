import type { AppRouter } from "@superset/host-service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { readSharedUsageQuota } from "./readUsageObservation";
import {
	acceptHostUsageObservation,
	consumeHostUsageInvalidation,
	currentHostUsageObservation,
} from "./usage-observations";
import { refreshUsageQuota } from "./utils/refreshUsageQuota/refreshUsageQuota";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type UsageAccount = RouterOutputs["usage"]["quota"][number];
export type UsageQuotaWindow = UsageAccount["windows"][number];

export const HOST_USAGE_QUOTA_QUERY_KEY = ["host-usage-quota"] as const;
const USAGE_REFETCH_INTERVAL_MS = 5 * 60_000;
const USAGE_CACHE_MS = 24 * 60 * 60_000;

/**
 * Subscription quota for every AI CLI login on the given host. The host
 * caches upstream responses for ~5 min (faster polling gets the endpoint
 * 429-blacklisted), so the poll here mostly re-reads that cache; `refresh`
 * bypasses it for an explicit user-initiated update.
 */
export function useHostUsageQuota(hostUrl: string | null) {
	const queryClient = useQueryClient();
	const queryKey = [...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl] as const;
	const utils = electronTrpc.useUtils();
	const [sharedFailure, setSharedFailure] = useState<{
		hostUrl: string;
		offline: boolean;
	} | null>(null);
	electronTrpc.hostUsage.onObservation.useSubscription(
		{ hostUrl: hostUrl ?? "" },
		{
			enabled: !!hostUrl,
			onData(incoming) {
				const observation = acceptHostUsageObservation(queryClient, incoming);
				if (observation.loading) return;
				setSharedFailure({
					hostUrl: observation.hostUrl,
					offline: observation.offline,
				});
				if (observation.data)
					queryClient.setQueryData(queryKey, observation.data);
				else if (consumeHostUsageInvalidation(queryClient, observation))
					void queryClient.resetQueries({ queryKey, exact: true });
			},
		},
	);
	const read = useCallback(
		(forceRefresh: boolean, signal?: AbortSignal) => {
			if (!hostUrl) return Promise.resolve([] as UsageAccount[]);
			return readSharedUsageQuota(
				queryClient,
				() =>
					utils.client.hostUsage.read.query(
						{ hostUrl, forceRefresh },
						{ signal },
					),
				() =>
					getHostServiceClientByUrl(hostUrl).usage.quota.query(
						{ forceRefresh },
						{ signal },
					),
				signal,
			);
		},
		[hostUrl, queryClient, utils.client],
	);

	const query = useQuery({
		queryKey,
		enabled: !!hostUrl,
		queryFn: ({ signal }) => read(false, signal),
		refetchInterval: USAGE_REFETCH_INTERVAL_MS,
		staleTime: USAGE_REFETCH_INTERVAL_MS,
		// Keep the last accounts visible when returning after a long absence.
		gcTime: USAGE_CACHE_MS,
	});

	const refresh = useCallback(async () => {
		if (!hostUrl) return;
		await refreshUsageQuota({
			queryClient,
			queryKey,
			load: () => read(true),
			selectCurrent: (fresh) => {
				const current = currentHostUsageObservation(queryClient, hostUrl);
				if (!current) return fresh;
				return current.offline || !current.data ? undefined : current.data;
			},
		});
	}, [hostUrl, queryClient, queryKey, read]);

	return {
		...query,
		isError:
			query.isError ||
			(sharedFailure?.hostUrl === hostUrl && sharedFailure.offline),
		refresh,
	};
}
