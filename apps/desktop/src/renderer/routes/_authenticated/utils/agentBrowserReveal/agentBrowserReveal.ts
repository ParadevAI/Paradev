import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { runPaneLayoutOp } from "renderer/routes/_authenticated/utils/runPaneLayoutOp";
import {
	canAgentRevealSidebar,
	markAgentRevealedSidebar,
} from "renderer/stores/agent-sidebar-reveal";

type Collections = Pick<AppCollections, "v2WorkspaceLocalState">;

function mayRevealSidebar(collections: Collections, workspaceId: string) {
	const row = collections.v2WorkspaceLocalState.get(workspaceId);
	return (
		row != null && !row.rightSidebarOpen && canAgentRevealSidebar(workspaceId)
	);
}

/** Adds a sidebar browser tab for an agent, opening a closed sidebar on it. */
export function openAgentBrowser({
	collections,
	workspaceId,
	url,
}: {
	collections: Collections;
	workspaceId: string;
	url: string;
}): string {
	const reveal = mayRevealSidebar(collections, workspaceId);
	const { paneId } = runPaneLayoutOp(collections, workspaceId, {
		type: "open",
		tool: "browser",
		url,
		background: !reveal,
	});
	if (!paneId) throw new Error("Browser open did not create a pane");
	if (reveal) markAgentRevealedSidebar(workspaceId);
	return paneId;
}

/** Opens a closed sidebar on the browser tab an agent is using. */
export function revealAgentBrowserPane({
	collections,
	workspaceId,
	paneId,
}: {
	collections: Collections;
	workspaceId: string;
	paneId: string;
}): void {
	if (!mayRevealSidebar(collections, workspaceId)) return;
	const { layout } = runPaneLayoutOp(collections, workspaceId, {
		type: "list",
	});
	const inSidebar = layout.sidebar?.tabs.some((tab) =>
		tab.panes.some((pane) => pane.id === paneId),
	);
	if (!inSidebar) return;
	runPaneLayoutOp(collections, workspaceId, { type: "focus", paneId });
	markAgentRevealedSidebar(workspaceId);
}
