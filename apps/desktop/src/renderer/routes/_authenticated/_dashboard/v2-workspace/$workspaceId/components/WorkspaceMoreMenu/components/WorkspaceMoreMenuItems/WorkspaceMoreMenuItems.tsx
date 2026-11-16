import type { ReactNode } from "react";
import type { HostShapedWorkspace } from "renderer/hooks/host-workspaces/useHostWorkspaces";
import { DROPDOWN_MENU_PARTS } from "renderer/lib/menuParts";
import { WorkspaceMenuItems } from "renderer/routes/_authenticated/_dashboard/components/WorkspaceMenuItems";
import { useWorkspaceMenuActions } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceMenuActions";
import type { WorkspaceMoveDirection } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceMoveDirections";
import { WorkspaceOpenInSub } from "./components/WorkspaceOpenInSub";
import { useWorkspaceMoreMenuState } from "./hooks/useWorkspaceMoreMenuState";

interface WorkspaceMoreMenuItemsProps {
	workspace: HostShapedWorkspace;
	runItems: ReactNode;
	moveDirections: WorkspaceMoveDirection[];
	onRename: (target: { cloud: boolean }) => void;
}

/** Mounted only while the menu is open, so its queries run only then. */
export function WorkspaceMoreMenuItems({
	workspace,
	runItems,
	moveDirections,
	onRename,
}: WorkspaceMoreMenuItemsProps) {
	const { state, isMine, togglePin, markTerminalsSeen } =
		useWorkspaceMoreMenuState(workspace);
	const actions = useWorkspaceMenuActions({
		workspaceId: workspace.id,
		projectId: workspace.projectId,
		isCloudWorkspace: state.isCloudWorkspace,
		workspaceName: workspace.name,
		branch: workspace.branch,
		isUnread: state.isUnread,
		markTerminalsSeen,
	});
	const { Separator } = DROPDOWN_MENU_PARTS;

	return (
		<WorkspaceMenuItems
			parts={DROPDOWN_MENU_PARTS}
			state={state}
			actions={{
				onTogglePin: togglePin,
				onRename: () => onRename({ cloud: state.isCloudWorkspace }),
				onCopyPath: actions.handleCopyPath,
				onCopyBranchName: actions.handleCopyBranchName,
				onCopyWorkspaceId: actions.handleCopyWorkspaceId,
				onToggleUnread: actions.handleToggleUnread,
				onClearStatus: actions.handleClearStatus,
				onRemovePullRequest: actions.handleRemovePullRequest,
				onRemoveFromSidebar:
					state.isCloudWorkspace && isMine
						? undefined
						: actions.handleRemoveFromSidebar,
				onDelete: actions.requestDelete,
			}}
			move={
				moveDirections.length > 0
					? {
							directions: moveDirections,
							workspace: {
								id: workspace.id,
								hostId: workspace.hostId,
								projectId: workspace.projectId,
								name: workspace.name,
							},
						}
					: undefined
			}
			leadingItems={
				<>
					{runItems}
					<Separator />
				</>
			}
			openInItem={
				state.isLocalWorkspace && (
					<WorkspaceOpenInSub
						parts={DROPDOWN_MENU_PARTS}
						workspaceId={workspace.id}
					/>
				)
			}
			showDeleteHotkey
		/>
	);
}
