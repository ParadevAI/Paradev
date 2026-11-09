import type { ActivePaneStatus } from "shared/tabs-types";

interface WorkspaceRowNeedsAttentionArgs {
	/** The row's unread flag: a manual mark, or a terminal in review/failed. */
	isUnread: boolean;
	workspaceStatus: ActivePaneStatus | null;
	isActive: boolean;
	isSelected: boolean;
	isCreatePending: boolean;
}

/**
 * Whether the row's name renders emphasized. The set matches what the dock
 * badge counts (`useV2AttentionWorkspaceCount`): unread, or an agent waiting
 * on an answer. `working` asks for nothing, and the open row is already
 * acknowledged by being open.
 */
export function workspaceRowNeedsAttention({
	isUnread,
	workspaceStatus,
	isActive,
	isSelected,
	isCreatePending,
}: WorkspaceRowNeedsAttentionArgs): boolean {
	if (isActive || isSelected || isCreatePending) return false;
	return isUnread || workspaceStatus === "permission";
}
