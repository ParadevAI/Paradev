import {
	allLayoutTabs,
	type PaneLayoutOpResult,
} from "@superset/shared/pane-layout-ops";
import { useEffect } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { persistBrowserPaneState } from "renderer/routes/_authenticated/utils/persistBrowserPaneState";
import {
	PaneLayoutOpError,
	runPaneLayoutOp,
} from "renderer/routes/_authenticated/utils/runPaneLayoutOp";

function wakeBrowser(
	collections: Pick<AppCollections, "workspaceLocalState">,
	workspaceId: string,
	paneId: string,
): PaneLayoutOpResult {
	const listed = runPaneLayoutOp(collections, workspaceId, { type: "list" });
	const tab = allLayoutTabs(listed.layout).find((tab) =>
		tab.panes.some((pane) => pane.id === paneId),
	);
	const pane = tab?.panes.find((pane) => pane.id === paneId);
	if (!tab || !pane?.browser) {
		throw new PaneLayoutOpError(
			"NOT_FOUND",
			`No browser pane ${paneId} in this workspace`,
		);
	}
	browserRuntimeRegistry.openBackground(
		paneId,
		pane.browser.url || "about:blank",
		workspaceId,
		persistBrowserPaneState(collections, workspaceId, paneId),
	);
	return { ...listed, paneId, tabId: tab.id };
}

/** Applies pane layout ops sent by the CLI and replies with the result. */
export function usePaneLayoutRequests() {
	const collections = useCollections();

	useEffect(() => {
		const subscription = electronTrpcClient.paneLayout.onRequest.subscribe(
			undefined,
			{
				onData: ({ requestId, workspaceId, op }) => {
					let reply: Parameters<
						typeof electronTrpcClient.paneLayout.respond.mutate
					>[0];
					try {
						const { paneId, tabId, layout } =
							op.type === "wakeBrowser"
								? wakeBrowser(collections, workspaceId, op.paneId)
								: runPaneLayoutOp(collections, workspaceId, op);
						reply = { requestId, result: { paneId, tabId, layout } };
					} catch (error) {
						reply = {
							requestId,
							error: {
								code:
									error instanceof PaneLayoutOpError ? error.code : undefined,
								message: error instanceof Error ? error.message : String(error),
							},
						};
					}
					electronTrpcClient.paneLayout.respond.mutate(reply).catch((err) => {
						console.error("[usePaneLayoutRequests] reply failed:", err);
					});
				},
			},
		);
		return () => {
			subscription.unsubscribe();
		};
	}, [collections]);
}
