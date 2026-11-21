import { Trans } from "@lingui/react/macro";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { useRunAfterMenuClose } from "@superset/ui/hooks/use-run-after-menu-close";
import {
	LuArrowUp,
	LuCpu,
	LuFolderPlus,
	LuFolderSymlink,
} from "react-icons/lu";
import { CONTEXT_MENU_PARTS } from "renderer/lib/menuParts";
import { MachineSizeMenuItems } from "renderer/routes/_authenticated/_dashboard/components/MachineSizeMenuItems";
import {
	type WorkspaceMenuActions,
	WorkspaceMenuItems,
	type WorkspaceMenuState,
} from "renderer/routes/_authenticated/_dashboard/components/WorkspaceMenuItems";
import type {
	MovableWorkspace,
	WorkspaceMoveDirection,
} from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceMoveDirections";
import { useDashboardSidebarHoverActions } from "../../../../providers/DashboardSidebarHoverProvider";
import { MoveToGroupItems } from "./components/MoveToGroupItems";

interface DashboardSidebarWorkspaceContextMenuProps
	extends Omit<WorkspaceMenuState, "isCloudWorkspace">,
		WorkspaceMenuActions {
	/** Null for project-less session workspaces. */
	projectId: string | null;
	/** Absent when the workspace can move nowhere. */
	move?: { directions: WorkspaceMoveDirection[]; workspace: MovableWorkspace };
	/** Only sessions and project workspaces can join a group. */
	isSessionWorkspace?: boolean;
	isInSection?: boolean;
	/** Its folder membership is a tag the API keeps, so it groups like any other row. */
	isCloudWorkspace?: boolean;
	showDeleteHotkey?: boolean;
	environmentItem?: React.ReactNode;
	onCreateSection: () => void;
	onMoveToSection: (sectionId: string | null) => void;
	children: React.ReactNode;
}

export function DashboardSidebarWorkspaceContextMenu({
	projectId,
	move,
	isSessionWorkspace = false,
	isInSection,
	isCloudWorkspace = false,
	showDeleteHotkey = false,
	environmentItem,
	onCreateSection,
	onMoveToSection,
	onRename,
	children,
	...rest
}: DashboardSidebarWorkspaceContextMenuProps) {
	const { runAfterClose, onCloseAutoFocus } = useRunAfterMenuClose();
	const { setContextMenuOpen } = useDashboardSidebarHoverActions();
	const canJoinGroup = projectId !== null || isSessionWorkspace;
	const {
		workspaceId,
		isLocalWorkspace,
		isPinned,
		isUnread,
		hasStatus,
		hasPullRequest,
		...actions
	} = rest;

	return (
		<ContextMenu onOpenChange={setContextMenuOpen}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={onCloseAutoFocus}>
				<WorkspaceMenuItems
					parts={CONTEXT_MENU_PARTS}
					state={{
						workspaceId,
						isLocalWorkspace,
						isCloudWorkspace,
						isPinned,
						isUnread,
						hasStatus,
						hasPullRequest,
					}}
					actions={{
						...actions,
						onRename: onRename && (() => runAfterClose(onRename)),
					}}
					move={move}
					showDeleteHotkey={showDeleteHotkey}
					groupItems={
						// Group actions change placement (sectionId/tabOrder), which a
						// pinned row doesn't show; the change would only appear on unpin.
						<>
							{!isPinned && canJoinGroup && (
								<>
									<ContextMenuSeparator />
									<ContextMenuItem onSelect={onCreateSection}>
										<LuFolderPlus className="size-4 mr-2" />
										<Trans>New group from workspace</Trans>
									</ContextMenuItem>
									<ContextMenuSub>
										<ContextMenuSubTrigger>
											<LuFolderSymlink className="size-4 mr-2" />
											<Trans>Move to group</Trans>
										</ContextMenuSubTrigger>
										<ContextMenuSubContent>
											<MoveToGroupItems
												projectId={projectId}
												onMoveToSection={onMoveToSection}
											/>
											<ContextMenuItem onSelect={onCreateSection}>
												<LuFolderPlus className="size-4 mr-2" />
												<Trans>Create new group</Trans>
											</ContextMenuItem>
										</ContextMenuSubContent>
									</ContextMenuSub>
									{isInSection && (
										<ContextMenuItem onSelect={() => onMoveToSection(null)}>
											<LuArrowUp className="size-4 mr-2" />
											<Trans>Ungroup</Trans>
										</ContextMenuItem>
									)}
								</>
							)}
							{environmentItem}
						</>
					}
					afterMoveItems={
						isCloudWorkspace && (
							<>
								<ContextMenuSeparator />
								<ContextMenuSub>
									<ContextMenuSubTrigger>
										<LuCpu className="size-4 mr-2" />
										<Trans>Machine size</Trans>
									</ContextMenuSubTrigger>
									<ContextMenuSubContent className="min-w-64">
										<MachineSizeMenuItems
											workspaceId={workspaceId}
											menu="context"
											runAfterClose={runAfterClose}
										/>
									</ContextMenuSubContent>
								</ContextMenuSub>
							</>
						)
					}
				/>
			</ContextMenuContent>
		</ContextMenu>
	);
}
