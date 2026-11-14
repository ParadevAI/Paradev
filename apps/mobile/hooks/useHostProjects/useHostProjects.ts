import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { WorkspacesHost } from "@/hooks/useHostWorkspaces";
import {
	getHostServiceClientByUrl,
	type HostProjectRow,
	hostServiceUrl,
} from "@/lib/host-service/client";

export interface HostProjectItem {
	id: string;
	name: string;
	iconUrl: string | null;
	primaryRepositoryId: string;
	/** The primary repository's GitHub owner and name. */
	repoOwner: string | null;
	repoName: string | null;
}

const PROJECTS_REFETCH_INTERVAL_MS = 30_000;

/** What a host older than multi-repo projects serves instead of `repositories`. */
interface LegacyProjectFields {
	repoOwner?: string | null;
	repoName?: string | null;
	repoPath?: string | null;
}

function folderName(path: string | null | undefined): string | null {
	return path?.split(/[\\/]/).filter(Boolean).pop() ?? null;
}

export function toHostProjectItem(
	row: HostProjectRow & LegacyProjectFields,
): HostProjectItem {
	const primary =
		(row.repositories ?? []).find(
			(repository) => repository.id === row.primaryRepositoryId,
		) ?? null;
	const repoOwner = primary?.owner ?? row.repoOwner ?? null;
	// Custom local-first icon wins; fall back to the GitHub owner avatar.
	const iconUrl =
		row.icon ??
		(repoOwner ? `https://github.com/${repoOwner}.png?size=64` : null);
	return {
		id: row.id,
		name: row.name || primary?.name || folderName(row.repoPath) || row.id,
		iconUrl,
		primaryRepositoryId: row.primaryRepositoryId,
		repoOwner,
		repoName: primary?.repoName ?? row.repoName ?? null,
	};
}

export interface UseHostProjectsResult {
	projects: HostProjectItem[];
	/** True once the host answered or failed. Gates empty states only. */
	isReady: boolean;
}

/**
 * Projects served by one host's `project.list` over the relay — projects
 * are fully local (host.db owns them; the cloud collection is retired), so
 * the host is the only source that includes local-first projects.
 */
export function useHostProjects(
	host: WorkspacesHost | null,
): UseHostProjectsResult {
	const hostUrl = host
		? hostServiceUrl(host.organizationId, host.machineId)
		: null;

	const query = useQuery({
		queryKey: ["host-service", "projects", "list", host?.machineId, hostUrl],
		enabled: hostUrl !== null && (host?.isOnline ?? false),
		refetchInterval: PROJECTS_REFETCH_INTERVAL_MS,
		networkMode: "always" as const,
		retry: 1,
		queryFn: async () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(hostUrl).project.list.query();
		},
	});

	const projects = useMemo(
		() => (query.data ?? []).map(toHostProjectItem),
		[query.data],
	);

	return {
		projects,
		isReady:
			query.isSuccess ||
			query.isError ||
			host === null ||
			host.isOnline === false,
	};
}
