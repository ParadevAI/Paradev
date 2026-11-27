import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import {
	agentPaneClaims,
	isClaimed,
} from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/utils/agentPaneClaims";
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
	if (!collections.workspaceLocalState.get(workspaceId)) {
		writeWorkspacePaneLayout(
			collections,
			{ id: workspaceId, projectId },
			[],
			[],
		);
	}
	const row = collections.workspaceLocalState.get(workspaceId);
	const existing = row?.paneLayout as
		| WorkspaceState<PaneViewerData>
		| undefined;
	const right = row?.rightPaneLayout as
		| WorkspaceState<PaneViewerData>
		| undefined;
	if (
		isClaimed(agentPaneClaims([existing, right]), {
			sessionIds: [chatSessionId],
		})
	) {
		return;
	}
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
	collections.workspaceLocalState.update(workspaceId, (draft) => {
		draft.paneLayout = { version, tabs, activeTabId };
	});
}
