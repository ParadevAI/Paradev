import type { TagFolderSettingInput } from "@superset/shared/workspace-tag-folders";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { WorkspacesHost } from "@/hooks/useHostWorkspaces";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";

const TAG_FOLDERS_REFETCH_INTERVAL_MS = 30_000;

const NO_SETTINGS: TagFolderSettingInput[] = [];

export function hostTagFoldersQueryKey(
	machineId: string | undefined,
	hostUrl: string | null,
) {
	return ["host-service", "tag-folders", "list", machineId, hostUrl] as const;
}

/**
 * The folder names, colors and order desktop saved on this host. A host that
 * cannot answer leaves folders named by their tag, in tag order.
 */
export function useHostTagFolders(
	host: WorkspacesHost | null,
): TagFolderSettingInput[] {
	const hostUrl = host
		? hostServiceUrl(host.organizationId, host.machineId)
		: null;

	const query = useQuery({
		queryKey: hostTagFoldersQueryKey(host?.machineId, hostUrl),
		enabled: hostUrl !== null && (host?.isOnline ?? false),
		refetchInterval: TAG_FOLDERS_REFETCH_INTERVAL_MS,
		networkMode: "always" as const,
		retry: 1,
		queryFn: async () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(hostUrl).tagFolders.list.query();
		},
	});

	return useMemo(
		() =>
			query.data?.map(({ scope, ...setting }) => ({
				projectId: scope,
				...setting,
			})) ?? NO_SETTINGS,
		[query.data],
	);
}
