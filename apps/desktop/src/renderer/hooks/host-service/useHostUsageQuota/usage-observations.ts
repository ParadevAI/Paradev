import type { QueryClient } from "@tanstack/react-query";
import type { HostUsageObservation } from "shared/host-usage-observation";

interface AcceptedObservation {
	value: HostUsageObservation;
	invalidationHandled: boolean;
}
const accepted = new WeakMap<QueryClient, Map<string, AcceptedObservation>>();
export function acceptHostUsageObservation(
	client: QueryClient,
	incoming: HostUsageObservation,
) {
	let hosts = accepted.get(client);
	if (!hosts) {
		hosts = new Map();
		accepted.set(client, hosts);
	}
	const current = hosts.get(incoming.hostUrl);
	if (current && current.value.version >= incoming.version)
		return current.value;
	hosts.set(incoming.hostUrl, { value: incoming, invalidationHandled: false });
	if (hosts.size > 128) {
		const oldest = hosts.keys().next().value;
		if (oldest) hosts.delete(oldest);
	}
	return incoming;
}
export function currentHostUsageObservation(
	client: QueryClient,
	hostUrl: string,
) {
	return accepted.get(client)?.get(hostUrl)?.value;
}
export function consumeHostUsageInvalidation(
	client: QueryClient,
	observation: HostUsageObservation,
) {
	const current = accepted.get(client)?.get(observation.hostUrl);
	if (
		!observation.invalidated ||
		!current ||
		current.value !== observation ||
		current.invalidationHandled
	)
		return false;
	current.invalidationHandled = true;
	return true;
}
