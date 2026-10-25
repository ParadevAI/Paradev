import type { AppRouter } from "@superset/host-service";
import { createTRPCClient, httpLink } from "@trpc/client";
import { authEvents } from "lib/trpc/routers/auth/utils/auth-functions";
import {
	getHostServiceCoordinator,
	type HostServiceStatusEvent,
} from "main/lib/host-service-coordinator";
import superjson from "superjson";
import { createHostUsageStore } from "./store";

let epoch = 0;
const hostEpochs = new Map<string, number>();
const hostUrls = new Map<string, Set<string>>();
let started = false;

export const hostUsageObservations = createHostUsageStore((hostUrl) => {
	if (!started) return null;
	const coordinator = getHostServiceCoordinator();
	for (const organizationId of coordinator.getActiveOrganizationIds()) {
		const connection = coordinator.getConnection(organizationId);
		if (!connection || hostUrl !== `http://127.0.0.1:${connection.port}`)
			continue;
		let urls = hostUrls.get(organizationId);
		if (!urls) {
			urls = new Set();
			hostUrls.set(organizationId, urls);
		}
		urls.add(hostUrl);
		const client = createTRPCClient<AppRouter>({
			links: [
				httpLink({
					url: `${hostUrl}/trpc`,
					transformer: superjson,
					headers: { Authorization: `Bearer ${connection.secret}` },
					fetch: (url, options) =>
						fetch(url, {
							...options,
							signal: options?.signal
								? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
								: AbortSignal.timeout(30_000),
						}),
				}),
			],
		});
		return {
			scope: JSON.stringify([organizationId, connection.machineId]),
			key: JSON.stringify([
				epoch,
				hostEpochs.get(organizationId) ?? 0,
				organizationId,
				connection.port,
				connection.secret,
			]),
			load: (force: boolean) =>
				client.usage.quota.query(
					{ forceRefresh: force },
					{ signal: AbortSignal.timeout(25_000) },
				),
		};
	}
	return null;
});

const reset = () => {
	epoch++;
	hostEpochs.clear();
	hostUrls.clear();
	hostUsageObservations.clear();
};
const statusChanged = ({ organizationId }: HostServiceStatusEvent) => {
	hostEpochs.set(organizationId, (hostEpochs.get(organizationId) ?? 0) + 1);
	for (const url of hostUrls.get(organizationId) ?? [])
		hostUsageObservations.invalidate(url);
	hostUrls.delete(organizationId);
};
export function startHostUsageObservations() {
	if (started) return;
	started = true;
	getHostServiceCoordinator().on("status-changed", statusChanged);
	authEvents.on("token-cleared", reset);
	authEvents.on("token-saved", reset);
}
export function stopHostUsageObservations() {
	if (!started) return;
	started = false;
	getHostServiceCoordinator().off("status-changed", statusChanged);
	authEvents.off("token-cleared", reset);
	authEvents.off("token-saved", reset);
	reset();
}
