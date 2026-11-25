import type { TagFolderSettingInput } from "@superset/shared/workspace-tag-folders";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import { useCallback } from "react";
import type { WorkspacesHost } from "@/hooks/useHostWorkspaces";
import { useStableHosts } from "@/hooks/useStableHosts";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";

import { hostTagFoldersQueryKey } from "./hostTagFoldersQueryKey";

const TAG_FOLDERS_REFETCH_INTERVAL_MS = 30_000;

const NO_SETTINGS: TagFolderSettingInput[] = [];

type TagFolderRows = Awaited<
	ReturnType<
		ReturnType<typeof getHostServiceClientByUrl>["tagFolders"]["list"]["query"]
	>
>;

/**
 * The folder names, colors and order desktop saved on each host, by machine
 * id. A host that cannot answer leaves folders named by their tag, in tag
 * order.
 */
export function useHostTagFolders(
	hosts: readonly WorkspacesHost[],
): Map<string, TagFolderSettingInput[]> {
	const stableHosts = useStableHosts(hosts);

	const combine = useCallback(
		(results: UseQueryResult<TagFolderRows>[]) => {
			const byHost = new Map<string, TagFolderSettingInput[]>();
			stableHosts.forEach((host, index) => {
				byHost.set(
					host.machineId,
					results[index]?.data?.map(({ scope, ...setting }) => ({
						projectId: scope,
						...setting,
					})) ?? NO_SETTINGS,
				);
			});
			return byHost;
		},
		[stableHosts],
	);

	return useQueries({
		queries: stableHosts.map((host) => {
			const hostUrl = hostServiceUrl(host.organizationId, host.machineId);
			return {
				queryKey: hostTagFoldersQueryKey(host.machineId, host.organizationId),
				enabled: host.isOnline,
				refetchInterval: TAG_FOLDERS_REFETCH_INTERVAL_MS,
				networkMode: "always" as const,
				retry: 1,
				queryFn: () =>
					getHostServiceClientByUrl(hostUrl).tagFolders.list.query(),
			};
		}),
		combine,
	});
}
