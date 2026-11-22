import { isArchivedCloudWorkspaceStatus } from "@superset/shared/cloud-workspace-status";
import { useCallback, useMemo } from "react";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import type { TerminalAttention } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals/attention";
import {
	cloudRowAttention,
	hostRowAttention,
} from "@/screens/(authenticated)/(home)/home/utils/needsMe";
import { useUnreadWorkspacesStore } from "@/screens/(authenticated)/stores/unreadWorkspacesStore";

/** What each row's mark shows, for headers and counts that stand in for rows. */
export function useRowAttention(
	attentionByWorkspace: ReadonlyMap<string, TerminalAttention>,
) {
	const manualUnread = useUnreadWorkspacesStore((state) => state.manualUnread);
	const cloudReadAt = useUnreadWorkspacesStore((state) => state.cloudReadAt);
	const host = useCallback(
		(workspace: { id: string }) =>
			hostRowAttention(workspace.id, attentionByWorkspace, manualUnread),
		[attentionByWorkspace, manualUnread],
	);
	const cloud = useCallback(
		(row: CloudWorkspaceRow) =>
			isArchivedCloudWorkspaceStatus(row.status)
				? null
				: cloudRowAttention(row, cloudReadAt[row.id], !!manualUnread[row.id]),
		[cloudReadAt, manualUnread],
	);
	return useMemo(() => ({ host, cloud }), [host, cloud]);
}
