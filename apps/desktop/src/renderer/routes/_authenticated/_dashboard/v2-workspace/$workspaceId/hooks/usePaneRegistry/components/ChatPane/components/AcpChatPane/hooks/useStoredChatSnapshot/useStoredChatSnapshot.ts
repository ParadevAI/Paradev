import type { SessionSnapshot } from "@superset/chat/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import {
	loadStoredChatSnapshot,
	shownStoredChatKey,
	storedChatSnapshotKey,
} from "../../../../../../../../utils/loadStoredChatSnapshot";

/**
 * A cloud chat as the database holds it, so its pane shows the conversation
 * while the box wakes instead of an empty transcript. Null for a computer's
 * chat: the API keeps only a cloud box's.
 */
export function useStoredChatSnapshot(
	sessionId: string | null,
): SessionSnapshot | null {
	const { workspace } = useWorkspace();
	const { workspaces: cloudWorkspaces = [] } = useCloudWorkspaces();
	const isCloud = cloudWorkspaces.some((row) => row.id === workspace.id);
	// The app's query client, not the workspace's: the next pane of this workspace reads what this one loaded.
	const query = useQuery(
		{
			queryKey: storedChatSnapshotKey(sessionId),
			queryFn: () => loadStoredChatSnapshot(sessionId as string),
			placeholderData: () => {
				const shown = electronQueryClient.getQueryData<string>(
					shownStoredChatKey(workspace.id),
				);
				return shown
					? electronQueryClient.getQueryData<SessionSnapshot | null>(
							storedChatSnapshotKey(shown),
						)
					: undefined;
			},
			enabled: isCloud && sessionId !== null,
			staleTime: 60_000,
			retry: false,
		},
		electronQueryClient,
	);
	const shownId = query.data && !query.isPlaceholderData ? sessionId : null;
	useEffect(() => {
		if (shownId) {
			electronQueryClient.setQueryData(
				shownStoredChatKey(workspace.id),
				shownId,
			);
		}
	}, [shownId, workspace.id]);
	return query.data ?? null;
}
