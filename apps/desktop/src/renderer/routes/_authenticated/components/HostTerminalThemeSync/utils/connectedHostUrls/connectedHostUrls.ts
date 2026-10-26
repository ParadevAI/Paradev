import { buildHostRoutingKey } from "@superset/shared/host-routing";

export function connectedHostUrls({
	activeHostUrl,
	machineId,
	relayUrl,
	hosts,
}: {
	activeHostUrl: string | null;
	machineId: string;
	relayUrl: string;
	hosts: ReadonlyArray<{
		organizationId: string;
		machineId: string;
		isOnline: boolean;
	}>;
}): string[] {
	const remoteHostUrls = hosts
		.filter((host) => host.isOnline && host.machineId !== machineId)
		.map(
			(host) =>
				`${relayUrl}/hosts/${buildHostRoutingKey(host.organizationId, host.machineId)}`,
		);
	return activeHostUrl ? [activeHostUrl, ...remoteHostUrls] : remoteHostUrls;
}
