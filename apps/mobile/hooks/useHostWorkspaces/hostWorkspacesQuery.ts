import type { UseQueryResult } from "@tanstack/react-query";
import type { HostWorkspaceRow } from "@/lib/host-service/client";

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

export interface HostWorkspacesState {
	workspaces: HostWorkspaceItem[];
	/**
	 * True once the host answered or failed, or is offline. Gates empty
	 * states only — existing rows always render (cache-first rule).
	 */
	isReady: boolean;
}

const NO_WORKSPACES: HostWorkspaceItem[] = [];

/**
 * One host's `workspace.list`. Only an online host is asked. The query
 * function never answers for an offline host: a retry runs the newest
 * options, and an empty answer there would replace the cached rows.
 */
export function hostWorkspacesQueryOptions(
	host: WorkspacesHost,
	hostUrl: string,
	list: (hostUrl: string) => Promise<HostWorkspaceRow[]>,
) {
	return {
		queryKey: getHostWorkspacesQueryKey(host.machineId),
		enabled: host.isOnline,
		refetchInterval: WORKSPACES_REFETCH_INTERVAL_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: () => list(hostUrl),
	};
}

/** Each host's rows by machine id; an offline host keeps its last answer. */
export function combineHostWorkspaces(
	hosts: readonly WorkspacesHost[],
	results: readonly Pick<
		UseQueryResult<HostWorkspaceRow[]>,
		"data" | "isError" | "isSuccess"
	>[],
): Map<string, HostWorkspacesState> {
	const byHost = new Map<string, HostWorkspacesState>();
	hosts.forEach((host, index) => {
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
}
