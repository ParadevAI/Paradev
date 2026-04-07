import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	type OrgService,
	useHostService,
} from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";

export interface WorkspaceHostOption {
	id: string;
	name: string;
	isCloud: boolean;
}

interface UseWorkspaceHostOptionsResult {
	currentDeviceName: string | null;
	localHostService: OrgService | null;
	otherHosts: WorkspaceHostOption[];
}

export function useWorkspaceHostOptions(): UseWorkspaceHostOptionsResult {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { services } = useHostService();
	const { data: deviceInfo } = electronTrpc.auth.getDeviceInfo.useQuery();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const currentUserId = session?.user?.id ?? null;

	const localHostService =
		activeOrganizationId !== null
			? (services.get(activeOrganizationId) ?? null)
			: null;

	const { data: accessibleHosts = [] } = useLiveQuery(
		(q) =>
			q
				.from({ userHosts: collections.v2UsersHosts })
				.innerJoin({ hosts: collections.v2Hosts }, ({ userHosts, hosts }) =>
					eq(userHosts.hostId, hosts.id),
				)
				.where(({ userHosts, hosts }) =>
					and(
						eq(userHosts.userId, currentUserId ?? ""),
						eq(hosts.organizationId, activeOrganizationId ?? ""),
					),
				)
				.select(({ hosts }) => ({
					id: hosts.id,
					machineId: hosts.machineId,
					name: hosts.name,
				})),
		[activeOrganizationId, collections, currentUserId],
	);

	const otherHosts = useMemo(
		() =>
			accessibleHosts
				.filter((host) => host.machineId !== deviceInfo?.deviceId)
				.map((host) => ({
					id: host.id,
					name: host.name,
					isCloud: host.machineId == null,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[accessibleHosts, deviceInfo?.deviceId],
	);

	return {
		currentDeviceName: deviceInfo?.deviceName ?? null,
		localHostService,
		otherHosts,
	};
}
