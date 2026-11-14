import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useTerminalAgentStatuses } from "renderer/hooks/host-service/useTerminalAgentStatuses";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { authClient } from "renderer/lib/auth-client";
import type { WorkspaceMenuState } from "renderer/routes/_authenticated/_dashboard/components/WorkspaceMenuItems";
import { deriveWorkspaceStatus } from "renderer/routes/_authenticated/_dashboard/utils/deriveWorkspaceStatus";
import { useLinkedPullRequest } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useLinkedPullRequest";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";

/** What the sidebar row knows about a workspace, read without the sidebar. */
export function useWorkspaceMoreMenuState(workspace: HostShapedWorkspace) {
	const workspaceId = workspace.id;
	const collections = useCollections();
	const { setWorkspacePinned } = useDashboardSidebarState();
	const { machineId } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const { query: pullRequest } = useLinkedPullRequest(workspaceId);
	const bindings = useTerminalAgentBindings(workspaceId);
	const statuses = useTerminalAgentStatuses(workspaceId);
	const hasManualUnread = useV2NotificationStore((state) =>
		Boolean(state.manualUnread[workspaceId]),
	);
	const markTerminalSeen = useV2NotificationStore(
		(state) => state.markTerminalSeen,
	);
	const seenAt = useV2NotificationStore(
		(state) => state.workspaceSeenAt[workspaceId],
	);
	const { data: localStates = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				),
		[collections, workspaceId],
	);

	const cloudWorkspace = cloudWorkspaces?.find((row) => row.id === workspaceId);
	const isPinned =
		localStates.find((row) => row.workspaceId === workspaceId)?.sidebarState
			.pinnedAt != null;
	const { status, isUnread } = deriveWorkspaceStatus({
		terminalStatuses: statuses.values(),
		hasManualUnread,
		report: cloudWorkspace && {
			status: cloudWorkspace.agentStatus ?? null,
			at: cloudWorkspace.agentStatusAt?.getTime() ?? null,
		},
		seenAt,
	});
	const state: WorkspaceMenuState = {
		workspaceId,
		isLocalWorkspace: workspace.hostId === machineId,
		isCloudWorkspace: cloudWorkspace !== undefined,
		isPinned,
		isUnread,
		hasStatus: status !== null,
		hasPullRequest: Boolean(pullRequest.data),
	};

	return {
		state,
		isMine:
			cloudWorkspace !== undefined &&
			session?.user?.id !== undefined &&
			cloudWorkspace.createdBy?.userId === session.user.id,
		togglePin: () =>
			setWorkspacePinned(workspaceId, workspace.projectId, !isPinned),
		markTerminalsSeen: () => {
			for (const binding of bindings.values()) {
				markTerminalSeen(binding.terminalId, binding.lastEventAt);
			}
		},
	};
}
