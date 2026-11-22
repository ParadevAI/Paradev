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

export type { HostWorkspaceRow } from "@/lib/host-service/client";

export interface HostWorkspaceItem extends HostWorkspaceRow {
	/** False when the rows are cached and the host stopped answering. */
	hostReachable: boolean;
}

export interface WorkspacesHost {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

const WORKSPACES_REFETCH_INTERVAL_MS = 30_000;

/** Independent of the host's URL, so an offline host keeps its cached rows. */
export function getHostWorkspacesQueryKey(machineId: string | null) {
	return ["host-service", "workspaces", "list", machineId] as const;
}

export interface HostWorkspacesCacheOps {
	/** Resolve the URL to reach the host owning `hostId` (null = unreachable). */
	resolveHostUrl: (hostId: string) => string | null;
	/** Optimistically upsert a row into the host's cached list. */
	upsertWorkspace: (row: HostWorkspaceRow) => void;
	/** Rollback hammer: refetch the host's list after a failed write. */
	invalidateHost: (hostId: string) => void;
}

export interface HostWorkspacesState {
	workspaces: HostWorkspaceItem[];
	/**
	 * True once the host answered or failed, or is offline. Gates empty
	 * states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
}

export interface UseHostWorkspacesResult extends HostWorkspacesState {
	cache: HostWorkspacesCacheOps;
}

export interface UseHostsWorkspacesResult extends UseHostWorkspacesResult {
	byHost: Map<string, HostWorkspacesState>;
}

const NO_WORKSPACES: HostWorkspaceItem[] = [];

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
		(results: UseQueryResult<HostWorkspaceRow[]>[]) => {
			const byHost = new Map<string, HostWorkspacesState>();
			stableHosts.forEach((host, index) => {
				const query = results[index];
				const reachable = host.isOnline && !query?.isError;
				byHost.set(host.machineId, {
					workspaces:
						query?.data?.map((row) => ({ ...row, hostReachable: reachable })) ??
						NO_WORKSPACES,
					isReady: !host.isOnline || !!query?.isSuccess || !!query?.isError,
				});
			});
			return byHost;
		},
		[stableHosts],
	);

	const byHost = useQueries({
		queries: stableHosts.map((host) => {
			const hostUrl = host.isOnline
				? hostServiceUrl(host.organizationId, host.machineId)
				: null;
			return {
				queryKey: getHostWorkspacesQueryKey(host.machineId),
				enabled: hostUrl !== null,
				refetchInterval: WORKSPACES_REFETCH_INTERVAL_MS,
				retry: 1,
				networkMode: "always" as const,
				queryFn: async (): Promise<HostWorkspaceRow[]> => {
					if (!hostUrl) return [];
					return getHostServiceClientByUrl(hostUrl).workspace.list.query();
				},
			};
		}),
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
				if (!known.has(row.hostId)) return;
				queryClient.setQueryData<HostWorkspaceRow[] | undefined>(
					getHostWorkspacesQueryKey(row.hostId),
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
				if (!known.has(hostId)) return;
				void queryClient.invalidateQueries({
					queryKey: getHostWorkspacesQueryKey(hostId),
				});
			},
		};
	}, [stableHosts, queryClient]);

	return { workspaces, isReady, cache, byHost };
}

/** One host's workspaces; see useHostsWorkspaces. */
export function useHostWorkspaces(
	host: WorkspacesHost | null,
): UseHostWorkspacesResult {
	const hosts = useMemo(() => (host ? [host] : []), [host]);
	const { workspaces, isReady, cache } = useHostsWorkspaces(hosts);
	return { workspaces, isReady, cache };
}
