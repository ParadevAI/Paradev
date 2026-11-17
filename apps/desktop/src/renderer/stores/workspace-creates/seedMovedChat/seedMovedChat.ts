import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { writeWorkspacePaneLayout } from "../writeWorkspacePaneLayout";

/**
 * Opens a moved chat in the workspace it moves to, in a tab of its own. The
 * chat keeps its id across the move, so the pane can name it before the new
 * host has it, and shows the move's progress until it arrives.
 */
export function seedMovedChat({
	collections,
	workspaceId,
	projectId,
	chatSessionId,
	harnessSessionId,
	agentId,
	title,
}: {
	collections: AppCollections;
	workspaceId: string;
	/** The sidebar project the workspace files under; null for a cloud workspace. */
	projectId: string | null;
	chatSessionId: string;
	harnessSessionId: string;
	agentId: string;
	title: string | null;
}): void {
	if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
		writeWorkspacePaneLayout(
			collections,
			{ id: workspaceId, projectId },
			[],
			[],
		);
	}
	const existing = collections.v2WorkspaceLocalState.get(workspaceId)
		?.paneLayout as WorkspaceState<PaneViewerData> | undefined;
	const alreadyOpen = existing?.tabs.some((tab) =>
		Object.values(tab.panes).some(
			(pane) =>
				(pane.data as Partial<ChatPaneData>).sessionId === chatSessionId,
		),
	);
	if (alreadyOpen) return;
	const store = createWorkspaceStore<PaneViewerData>({
		initialState: existing,
	});
	store.getState().addTab({
		panes: [
			{
				kind: "chat-v3",
				data: {
					terminalId: chatSessionId,
					sessionId: chatSessionId,
					awaitingMove: true,
					agent: { id: agentId, sessionId: harnessSessionId },
					...(title ? { chatTitle: title } : {}),
				} as ChatPaneData,
			},
		],
	});
	const { version, tabs, activeTabId } = store.getState();
	collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
		draft.paneLayout = { version, tabs, activeTabId };
	});
}
