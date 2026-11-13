import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { persistBrowserPaneState } from "renderer/routes/_authenticated/utils/persistBrowserPaneState";
import { writeWorkspacePaneLayout } from "renderer/stores/workspace-creates/writeWorkspacePaneLayout";
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
		const subscription = electronTrpcClient.browser.onOpenRequest.subscribe(
			undefined,
			{
				onData: (request: BrowserOpenRequest) => {
					if (!request.show) {
						try {
							if (!collections.v2WorkspaceLocalState.get(request.workspaceId)) {
								writeWorkspacePaneLayout(
									collections,
									{
										id: request.workspaceId,
										projectId: request.projectId,
									},
									[],
									[],
								);
							}
							const paneId = openBackgroundBrowser({
								collections,
								workspaceId: request.workspaceId,
								url: request.url,
							});
							browserRuntimeRegistry.openBackground(
								paneId,
								request.url,
								request.workspaceId,
								persistBrowserPaneState(
									collections,
									request.workspaceId,
									paneId,
								),
							);
							electronTrpcClient.browser.resolveOpenRequest
								.mutate({ requestId: request.requestId, paneId })
								.catch((err) => {
									console.error(
										"[useBrowserOpenRequests] resolve open failed:",
										err,
									);
								});
						} catch (err) {
							console.error(
								"[useBrowserOpenRequests] background open failed:",
								err,
							);
						}
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
