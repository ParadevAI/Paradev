import type { QueryClient } from "@tanstack/react-query";
import type {
	HostUsageObservation,
	UsageAccount,
} from "shared/host-usage-observation";
import { acceptHostUsageObservation } from "./usage-observations";

export async function readSharedUsageQuota(
	client: QueryClient,
	readShared: () => Promise<HostUsageObservation | null>,
	readDirect: () => Promise<UsageAccount[]>,
	signal?: AbortSignal,
) {
	const observation = await readShared();
	signal?.throwIfAborted();
	if (!observation) return readDirect();
	const latest = acceptHostUsageObservation(client, observation);
	if (latest.offline || !latest.data)
		throw new Error("Host quota observation unavailable");
	return latest.data;
}
