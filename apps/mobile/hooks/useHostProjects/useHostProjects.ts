import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { WorkspacesHost } from "@/hooks/useHostWorkspaces";
import { useStableHosts } from "@/hooks/useStableHosts";
import {
	getHostServiceClientByUrl,
	type HostProjectRow,
	hostServiceUrl,
} from "@/lib/host-service/client";

export interface HostProjectItem {
	id: string;
	name: string;
	iconUrl: string | null;
	repoOwner: string | null;
	repoName: string | null;
	/** Epoch ms; 0 when the host predates the field. */
	createdAt: number;
}

const PROJECTS_REFETCH_INTERVAL_MS = 30_000;

/**
 * Normalize a project.list row from any host version — hosts on
 * pre-local-first builds don't serve `name`, so fall back to the folder
 * basename (both path separators), matching the desktop rule.
 */
export function toHostProjectItem(
	row: Partial<HostProjectRow> & { id: string; repoPath: string },
): HostProjectItem {
	const repoOwner = row.repoOwner ?? null;
	// Custom local-first icon wins; fall back to the GitHub owner avatar.
	const iconUrl =
		row.icon ??
		(repoOwner ? `https://github.com/${repoOwner}.png?size=64` : null);
	return {
		id: row.id,
		name: row.name || row.repoPath.split(/[\\/]/).pop() || row.id,
		iconUrl,
		repoOwner,
		repoName: row.repoName ?? null,
		createdAt: row.createdAt ?? 0,
	};
}

export interface UseHostProjectsResult {
	projects: HostProjectItem[];
	/** True once the host answered or failed. Gates empty states only. */
	isReady: boolean;
}

/**
 * One host's `project.list`. Only an online host is asked; an offline host
 * serves the projects it last returned.
 */
export function hostProjectsQueryOptions(host: WorkspacesHost) {
	const hostUrl = hostServiceUrl(host.organizationId, host.machineId);
	return {
		queryKey: ["host-service", "projects", "list", host.machineId, hostUrl],
		enabled: host.isOnline,
		refetchInterval: PROJECTS_REFETCH_INTERVAL_MS,
		networkMode: "always" as const,
		retry: 1,
		queryFn: () => getHostServiceClientByUrl(hostUrl).project.list.query(),
	};
}

type ProjectListRows = Awaited<
	ReturnType<ReturnType<typeof hostProjectsQueryOptions>["queryFn"]>
>;

export interface UseHostsProjectsResult {
	byHost: Map<string, HostProjectItem[]>;
	isReady: boolean;
}

const NO_PROJECTS: HostProjectItem[] = [];

/**
 * Projects served by each host's `project.list` over the relay — projects
 * are fully local (host.db owns them; the cloud collection is retired), so
 * the host is the only source that includes local-first projects.
 */
export function useHostsProjects(
	hosts: readonly WorkspacesHost[],
): UseHostsProjectsResult {
	const stableHosts = useStableHosts(hosts);

	const combine = useCallback(
		(results: UseQueryResult<ProjectListRows>[]) => {
			const byHost = new Map<string, HostProjectItem[]>();
			let isReady = true;
			stableHosts.forEach((host, index) => {
				const query = results[index];
				byHost.set(
					host.machineId,
					query?.data?.map(toHostProjectItem) ?? NO_PROJECTS,
				);
				if (host.isOnline && !query?.isSuccess && !query?.isError) {
					isReady = false;
				}
			});
			return { byHost, isReady };
		},
		[stableHosts],
	);

	return useQueries({
		queries: stableHosts.map(hostProjectsQueryOptions),
		combine,
	});
}

export function useHostProjects(
	host: WorkspacesHost | null,
): UseHostProjectsResult {
	const hosts = useMemo(() => (host ? [host] : []), [host]);
	const { byHost, isReady } = useHostsProjects(hosts);
	return {
		projects: (host && byHost.get(host.machineId)) || NO_PROJECTS,
		isReady,
	};
}
