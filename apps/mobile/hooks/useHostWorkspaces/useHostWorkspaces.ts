import {
	type UseQueryResult,
	useQueries,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
	getHostServiceClientByUrl,
	type HostWorkspaceRow,
	hostServiceUrl,
} from "@/lib/host-service/client";

import {
	combineHostWorkspaces,
	getHostWorkspacesQueryKey,
	type HostWorkspacesState,
	hostWorkspacesQueryOptions,
	type WorkspacesHost,
} from "./hostWorkspacesQuery";

export type { HostWorkspaceRow } from "@/lib/host-service/client";
export {
	getHostWorkspacesQueryKey,
	getHostWorkspacesQueryPrefix,
	type HostWorkspaceItem,
	type HostWorkspacesState,
	type WorkspacesHost,
} from "./hostWorkspacesQuery";

export interface HostWorkspacesCacheOps {
	/** Resolve the URL to reach the host owning `hostId` (null = unreachable). */
	resolveHostUrl: (hostId: string) => string | null;
	/** Optimistically upsert a row into the host's cached list. */
	upsertWorkspace: (row: HostWorkspaceRow) => void;
	/** Rollback hammer: refetch the host's list after a failed write. */
	invalidateHost: (hostId: string) => void;
}

export interface UseHostsWorkspacesResult
	extends Omit<HostWorkspacesState, "failed"> {
	cache: HostWorkspacesCacheOps;
	byHost: Map<string, HostWorkspacesState>;
}

const listWorkspaces = (hostUrl: string): Promise<HostWorkspaceRow[]> =>
	getHostServiceClientByUrl(hostUrl).workspace.list.query();

/**
 * Workspaces served by each host's `workspace.list` over the relay. Only
 * online hosts are asked; an offline host serves the rows it last returned.
 * The 30s poll plus focus/pull refetch is the healing path.
 */
export function useHostsWorkspaces(
	hosts: readonly WorkspacesHost[],
): UseHostsWorkspacesResult {
	const queryClient = useQueryClient();

	const hostsKey = hosts
		.map((host) => `${host.organizationId}:${host.machineId}:${host.isOnline}`)
		.join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: hostsKey stands for `hosts`
	const stableHosts = useMemo(() => hosts, [hostsKey]);

	const combine = useCallback(
		(results: UseQueryResult<HostWorkspaceRow[]>[]) =>
			combineHostWorkspaces(stableHosts, results),
		[stableHosts],
	);

	const byHost = useQueries({
		queries: stableHosts.map((host) =>
			hostWorkspacesQueryOptions(
				host,
				hostServiceUrl(host.organizationId, host.machineId),
				listWorkspaces,
			),
		),
		combine,
	});

	const workspaces = useMemo(
		() => [...byHost.values()].flatMap((state) => state.workspaces),
		[byHost],
	);
	const isReady = [...byHost.values()].every((state) => state.isReady);

	const cache = useMemo<HostWorkspacesCacheOps>(() => {
		const known = new Map(stableHosts.map((host) => [host.machineId, host]));
		return {
			resolveHostUrl: (hostId) => {
				const host = known.get(hostId);
				return host?.isOnline
					? hostServiceUrl(host.organizationId, host.machineId)
					: null;
			},
			upsertWorkspace: (row) => {
				const host = known.get(row.hostId);
				if (!host) return;
				queryClient.setQueryData<HostWorkspaceRow[] | undefined>(
					getHostWorkspacesQueryKey(host.machineId, host.organizationId),
					(rows) => {
						if (!rows) return [row];
						const exists = rows.some((existing) => existing.id === row.id);
						return exists
							? rows.map((existing) =>
									existing.id === row.id ? { ...existing, ...row } : existing,
								)
							: [...rows, row];
					},
				);
			},
			invalidateHost: (hostId) => {
				const host = known.get(hostId);
				if (!host) return;
				void queryClient.invalidateQueries({
					queryKey: getHostWorkspacesQueryKey(
						host.machineId,
						host.organizationId,
					),
				});
			},
		};
	}, [stableHosts, queryClient]);

	return { workspaces, isReady, cache, byHost };
}
