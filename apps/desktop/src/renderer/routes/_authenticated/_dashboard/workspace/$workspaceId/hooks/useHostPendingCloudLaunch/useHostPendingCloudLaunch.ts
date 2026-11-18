import type { WorkspaceStore } from "@superset/panes";
import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useMemo } from "react";
import { useWorkspaceConnectionRefresh } from "renderer/hooks/host-service/useWorkspaceConnectionRefresh";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { StoreApi } from "zustand";
import type { PaneViewerData } from "../../types";
import { canShowEmptyLayout } from "./utils/canShowEmptyLayout";
import { fetchPendingCloudLaunch } from "./utils/fetchPendingCloudLaunch";
import { seedHostPendingLaunch } from "./utils/seedHostPendingLaunch";

/**
 * Opens the waiting pane for a launch this desktop did not create (CLI,
 * automation, agent task): the box reports it until the agent starts.
 */
export function useHostPendingCloudLaunch({
	workspaceId,
	store,
	isLayoutReady,
}: {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	isLayoutReady: boolean;
}): { canShowEmptyLayout: boolean } {
	const target = useWorkspaceHostTarget(workspaceId);
	const hostUrl =
		target.status === "ready" && target.kind === "sandbox" ? target.url : null;
	const enabled = hostUrl !== null && isLayoutReady;
	const queryKey = useMemo(
		() => ["sandbox-pending-launch", hostUrl, workspaceId],
		[hostUrl, workspaceId],
	);
	const { data: launch, status } = useQuery({
		queryKey,
		enabled,
		queryFn: () =>
			hostUrl
				? fetchPendingCloudLaunch(
						getHostServiceClientByUrl(hostUrl),
						workspaceId,
					)
				: null,
		refetchOnWindowFocus: false,
		gcTime: 0,
	});
	useWorkspaceConnectionRefresh(workspaceId, queryKey, enabled);

	// Before paint, so the frame that has the answer never shows the empty view.
	useLayoutEffect(() => {
		if (isLayoutReady && launch) seedHostPendingLaunch(store, launch);
	}, [isLayoutReady, launch, store]);

	return {
		canShowEmptyLayout: canShowEmptyLayout({
			isLayoutReady,
			isSandboxHost: hostUrl !== null,
			pendingLaunchStatus: status,
		}),
	};
}
