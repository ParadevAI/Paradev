import type { SessionSnapshot } from "@superset/chat/core";
import { useQuery } from "@tanstack/react-query";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import {
	loadStoredChatSnapshot,
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
			enabled: isCloud && sessionId !== null,
			staleTime: 60_000,
			retry: false,
		},
		electronQueryClient,
	);
	return query.data ?? null;
}
