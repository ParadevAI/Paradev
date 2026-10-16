import { useCallback } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import type { FinishedWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useFinishedWorkspaces";
import { useCloudSidebarStore } from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";

/** Marks a finished workspace as looked at, the way opening it from the sidebar does: its dot and its inbox row go until the agent finishes again. */
export function useDismissFinishedWorkspace() {
	const organizationId = useActiveOrganizationId();
	return useCallback(
		(entry: FinishedWorkspace) => {
			if (entry.location === "cloud") {
				if (organizationId) {
					useCloudSidebarStore
						.getState()
						.markRead(organizationId, entry.workspaceId, entry.finishedAt);
				}
				return;
			}
			const { markTerminalSeen } = useV2NotificationStore.getState();
			for (const terminal of entry.terminals) {
				markTerminalSeen(terminal.terminalId, terminal.at);
			}
		},
		[organizationId],
	);
}
