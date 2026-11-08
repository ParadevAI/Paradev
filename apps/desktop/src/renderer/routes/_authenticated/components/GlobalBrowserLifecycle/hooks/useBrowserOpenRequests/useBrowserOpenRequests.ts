import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { persistAgentBrowserState } from "renderer/routes/_authenticated/utils/persistAgentBrowserState";
import { writeWorkspacePaneLayout } from "renderer/stores/workspace-creates/writeWorkspacePaneLayout";
import { AGENT_BROWSER_PARTITION } from "shared/constants";
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
							const paneId = openBackgroundBrowser({ collections, ...request });
							browserRuntimeRegistry.openBackground(
								paneId,
								request.url,
								request.workspaceId,
								persistAgentBrowserState(
									collections,
									request.workspaceId,
									paneId,
								),
								AGENT_BROWSER_PARTITION,
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
							openUrlAgent: true,
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
