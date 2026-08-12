import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useHostsPresence } from "renderer/hooks/useHostsPresence";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";

export interface WorkspaceHostOption {
	id: string;
	name: string;
	isOnline: boolean;
}

interface UseWorkspaceHostOptionsResult {
	currentDeviceName: string | null;
	/** machineId of the current device (the one running this desktop app). */
	localHostId: string | null;
	/**
	 * Relay connectivity of the local device as the cloud sees it; null while
	 * its v2Hosts row hasn't synced. Cloud-dispatched work (automations) needs
	 * this even for the local device.
	 */
	localHostIsOnline: boolean | null;
	activeHostUrl: string | null;
	otherHosts: WorkspaceHostOption[];
}

export function useWorkspaceHostOptions(): UseWorkspaceHostOptionsResult {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const currentUserId = session?.user?.id ?? null;

	const { data: accessibleHosts = [] } = useLiveQuery(
		(q) =>
			q
				.from({ userHosts: collections.v2UsersHosts })
				.innerJoin({ hosts: collections.v2Hosts }, ({ userHosts, hosts }) =>
					eq(userHosts.hostId, hosts.machineId),
				)
				.where(({ userHosts, hosts }) =>
					and(
						eq(userHosts.userId, currentUserId ?? ""),
						eq(hosts.organizationId, activeOrganizationId ?? ""),
					),
				)
				.select(({ hosts }) => ({
					machineId: hosts.machineId,
					name: hosts.name,
					isOnline: hosts.isOnline,
				})),
		[activeOrganizationId, collections, currentUserId],
	);

	const presenceTargets = useMemo(
		() =>
			activeOrganizationId
				? accessibleHosts.map((host) => ({
						organizationId: activeOrganizationId,
						machineId: host.machineId,
					}))
				: [],
		[accessibleHosts, activeOrganizationId],
	);
	const presence = useHostsPresence(presenceTargets);
	const hostsWithPresence = useMemo(
		() =>
			presence
				? accessibleHosts.map((host) => ({
						...host,
						isOnline: presence.get(host.machineId) ?? host.isOnline,
					}))
				: accessibleHosts,
		[accessibleHosts, presence],
	);

	const localHost = useMemo(
		() =>
			hostsWithPresence.find((host) => host.machineId === machineId) ?? null,
		[hostsWithPresence, machineId],
	);

	const otherHosts = useMemo(
		() =>
			hostsWithPresence
				.filter((host) => host.machineId !== machineId)
				.map((host) => ({
					id: host.machineId,
					name: host.name,
					isOnline: host.isOnline ?? false,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[hostsWithPresence, machineId],
	);

	// Always surface the local device, even if its v2Hosts row hasn't synced
	// via Electric — the picker is useless without "this device" present.
	return {
		currentDeviceName: localHost?.name ?? (machineId ? "This device" : null),
		localHostId: localHost?.machineId ?? machineId,
		localHostIsOnline: localHost ? (localHost.isOnline ?? false) : null,
		activeHostUrl,
		otherHosts,
	};
}
