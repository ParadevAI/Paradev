import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { runPaneLayoutOp } from "renderer/routes/_authenticated/utils/runPaneLayoutOp";
import {
	canAgentRevealSidebar,
	markAgentBrowsingSidebar,
} from "renderer/stores/agent-sidebar-reveal";

type Collections = Pick<AppCollections, "v2WorkspaceLocalState">;

function isSidebarOpen(collections: Collections, workspaceId: string) {
	return (
		collections.v2WorkspaceLocalState.get(workspaceId)?.rightSidebarOpen ??
		false
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
	const reveal =
		!isSidebarOpen(collections, workspaceId) &&
		canAgentRevealSidebar(workspaceId);
	const { paneId } = runPaneLayoutOp(collections, workspaceId, {
		type: "open",
		tool: "browser",
		url,
		background: !reveal,
	});
	if (!paneId) throw new Error("Browser open did not create a pane");
	markAgentBrowsingSidebar(workspaceId);
	return paneId;
}

/** Opens a closed sidebar on the browser tab an agent is using. */
export function showAgentBrowserPane({
	collections,
	workspaceId,
	paneId,
}: {
	collections: Collections;
	workspaceId: string;
	paneId: string;
}): void {
	if (!canAgentRevealSidebar(workspaceId)) return;
	const { layout } = runPaneLayoutOp(collections, workspaceId, {
		type: "list",
	});
	const inSidebar = layout.sidebar?.tabs.some((tab) =>
		tab.panes.some((pane) => pane.id === paneId),
	);
	if (!inSidebar) return;
	if (!isSidebarOpen(collections, workspaceId)) {
		runPaneLayoutOp(collections, workspaceId, { type: "focus", paneId });
	}
	markAgentBrowsingSidebar(workspaceId);
}
