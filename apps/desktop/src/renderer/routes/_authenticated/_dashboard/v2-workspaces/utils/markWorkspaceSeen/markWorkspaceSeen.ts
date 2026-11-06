import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import type { AccessibleV2Workspace } from "../../hooks/useAccessibleV2Workspaces";

/** Clears what made the workspace read as unread: its finished terminals, a cloud report, a manual mark. */
export function markWorkspaceSeen(
	workspace: Pick<AccessibleV2Workspace, "id" | "seenMarks">,
): void {
	const notifications = useV2NotificationStore.getState();
	notifications.clearManualUnread(workspace.id);
	for (const terminal of workspace.seenMarks.terminals) {
		notifications.markTerminalSeen(terminal.terminalId, terminal.lastEventAt);
	}
	if (workspace.seenMarks.reportedAt !== null) {
		notifications.markWorkspaceSeen(
			workspace.id,
			workspace.seenMarks.reportedAt,
		);
	}
}
