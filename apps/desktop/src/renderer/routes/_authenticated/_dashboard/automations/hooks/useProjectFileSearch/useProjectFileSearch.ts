import { useCallback } from "react";
import type { FileMentionSearchFn } from "renderer/components/MarkdownEditor/components/FileMention";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { WorkspaceHostTarget } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/types";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const SEARCH_LIMIT = 15;

export function useProjectFileSearch({
	hostTarget,
	projectId,
}: {
	hostTarget: WorkspaceHostTarget;
	projectId: string | null;
}): FileMentionSearchFn | undefined {
	const { activeHostUrl } = useLocalHostService();

	const hostUrl =
		hostTarget.kind === "local"
			? activeHostUrl
			: `${env.RELAY_URL}/hosts/${hostTarget.hostId}`;

	return useCallback<FileMentionSearchFn>(
		async (query) => {
			if (!projectId || !hostUrl) return [];
			const client = getHostServiceClientByUrl(hostUrl);
			const result = await client.filesystem.searchFiles.query({
				projectId,
				query,
				limit: SEARCH_LIMIT,
			});
			return result.matches.map((match) => ({
				id: match.absolutePath,
				name: match.name,
				relativePath: match.relativePath,
				isDirectory: match.kind === "directory",
			}));
		},
		[hostUrl, projectId],
	);
}
