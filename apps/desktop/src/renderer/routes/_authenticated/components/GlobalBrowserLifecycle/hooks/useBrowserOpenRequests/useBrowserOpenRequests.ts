import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import type { BrowserPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { updateWorkspaceView } from "renderer/routes/_authenticated/providers/CollectionsProvider/workspaceViews";
import { writeWorkspacePaneLayout } from "renderer/stores/workspace-creates/writeWorkspacePaneLayout";
import { withPaneData } from "shared/workspace-views";
import { openBackgroundBrowser } from "./utils/openBackgroundBrowser";

interface BrowserOpenRequest {
	workspaceId: string;
	projectId: string | null;
	url: string;
	target: "current-tab" | "new-tab";
	requestId: string;
	show: boolean;
}

/** Opens agent browsers without navigation unless the caller explicitly asks to show them. */
export function useBrowserOpenRequests() {
	const navigate = useNavigate();
	const collections = useCollections();

	useEffect(() => {
		const openInBackground = async (request: BrowserOpenRequest) => {
			if (!collections.v2WorkspaceLocalState.get(request.workspaceId)) {
				writeWorkspacePaneLayout(
					collections,
					{ id: request.workspaceId, projectId: request.projectId },
					[],
					[],
				);
			}
			await collections.v2WorkspaceViews.stateWhenReady();
			const paneId = openBackgroundBrowser({ collections, ...request });
			browserRuntimeRegistry.openBackground(
				paneId,
				request.url,
				request.workspaceId,
				(state) =>
					updateWorkspaceView(collections, request.workspaceId, (view) =>
						withPaneData(view, paneId, (data) => ({
							...(data as BrowserPaneData),
							...state,
						})),
					),
			);
		};
		const subscription = electronTrpcClient.browser.onOpenRequest.subscribe(
			undefined,
			{
				onData: (request: BrowserOpenRequest) => {
					if (!request.show) {
						openInBackground(request).catch((err) => {
							console.error(
								"[useBrowserOpenRequests] background open failed:",
								err,
							);
						});
						return;
					}
					navigateToV2Workspace(request.workspaceId, navigate, {
						search: {
							openUrl: request.url,
							openUrlTarget: request.target,
							openUrlRequestId: request.requestId,
						},
					}).catch((err) => {
						console.error("[useBrowserOpenRequests] navigate failed:", err);
					});
				},
			},
		);
		return () => {
			subscription.unsubscribe();
		};
	}, [navigate, collections]);
}
