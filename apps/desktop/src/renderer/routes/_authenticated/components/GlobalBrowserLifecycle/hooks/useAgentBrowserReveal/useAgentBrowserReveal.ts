import { useEffect } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { revealAgentBrowserPane } from "renderer/routes/_authenticated/utils/agentBrowserReveal";

export function useAgentBrowserReveal() {
	const collections = useCollections();

	useEffect(() => {
		const subscription = electronTrpcClient.browser.onAgentUse.subscribe(
			undefined,
			{
				onData: ({ paneId }: { paneId: string }) => {
					const workspaceId = browserRuntimeRegistry.getWorkspaceId(paneId);
					if (!workspaceId) return;
					revealAgentBrowserPane({ collections, workspaceId, paneId });
				},
			},
		);
		return () => {
			subscription.unsubscribe();
		};
	}, [collections]);
}
