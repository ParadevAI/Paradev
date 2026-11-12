import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import {
	LuArchive,
	LuArrowRightLeft,
	LuBellOff,
	LuClipboard,
	LuCopy,
	LuEye,
	LuEyeOff,
	LuGitBranch,
	LuHash,
	LuLink,
	LuPencil,
	LuPin,
	LuPinOff,
	LuRadioTower,
	LuTrash2,
	LuUnlink,
	LuX,
} from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import type { MenuParts } from "renderer/lib/menuParts";
import { useDashboardSidebarPortKill } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortKill";
import { useDashboardSidebarWorkspacePorts } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import {
	type MoveDestinationPick,
	MoveToDestinationItems,
} from "renderer/routes/_authenticated/_dashboard/components/MoveToDestinationItems";
import { useCopyShareLink } from "renderer/routes/_authenticated/_dashboard/hooks/useCopyShareLink";
import type { WorkspaceMoveDirection } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceMoveDirections";
import { WorkspaceOpenInSub } from "./components/WorkspaceOpenInSub";

export interface WorkspaceMenuState {
	workspaceId: string;
	/** Has a path on this computer to open or copy. */
	isLocalWorkspace: boolean;
	/** No host bindings to clear, and archived rather than deleted. */
	isCloudWorkspace: boolean;
	isPinned: boolean;
	isUnread: boolean;
	hasStatus: boolean;
	hasPullRequest: boolean;
}

export interface WorkspaceMenuActions {
	onTogglePin: () => void;
	/** Absent when the workspace cannot be renamed here. */
	onRename?: () => void;
	onCopyPath: () => void;
	onCopyBranchName: () => void;
	onCopyWorkspaceId: () => void;
	onToggleUnread: () => void;
	onClearStatus: () => void;
	onRemovePullRequest: () => void;
	/** Absent when the workspace cannot leave the sidebar (your own cloud workspace). */
	onRemoveFromSidebar?: () => void;
	onDelete?: () => void;
}

interface WorkspaceMenuItemsProps {
	parts: MenuParts;
	state: WorkspaceMenuState;
	actions: WorkspaceMenuActions;
	/** Absent when the workspace can move nowhere. */
	move?: {
		directions: WorkspaceMoveDirection[];
		fromHostId: string;
		onPick: (pick: MoveDestinationPick) => void;
	};
	/** Items above the shared ones, with their own separator. */
	leadingItems?: ReactNode;
	/** Items between the status group and Move to, with their own separator. */
	groupItems?: ReactNode;
	showDeleteHotkey?: boolean;
}

/** The body the sidebar's context menu and the workspace's ⋯ menu share. */
export function WorkspaceMenuItems({
	parts,
	state,
	actions,
	move,
	leadingItems,
	groupItems,
	showDeleteHotkey = false,
}: WorkspaceMenuItemsProps) {
	const { Item, Separator, Sub, SubTrigger, SubContent, Shortcut } = parts;
	const icon = cn("size-4", parts.iconClassName);
	const copyShareLink = useCopyShareLink();
	const portGroup = useDashboardSidebarWorkspacePorts(state.workspaceId);
	const { isPending: isKillingPorts, killPorts } =
		useDashboardSidebarPortKill();
	const ports = portGroup?.ports ?? [];
	const deleteHotkeyText = useHotkeyDisplay("CLOSE_WORKSPACE").text;
	const showDeleteShortcut =
		showDeleteHotkey && deleteHotkeyText !== "Unassigned";

	return (
		<>
			{leadingItems}
			<Item onSelect={actions.onTogglePin}>
				{state.isPinned ? (
					<>
						<LuPinOff className={icon} />
						<Trans>Unpin</Trans>
					</>
				) : (
					<>
						<LuPin className={icon} />
						<Trans>Pin</Trans>
					</>
				)}
			</Item>
			{actions.onRename && (
				<Item onSelect={actions.onRename}>
					<LuPencil className={icon} />
					<Trans>Rename</Trans>
				</Item>
			)}
			<Separator />
			{state.isLocalWorkspace && (
				<WorkspaceOpenInSub parts={parts} workspaceId={state.workspaceId} />
			)}
			<Sub>
				<SubTrigger>
					<LuCopy className={icon} />
					<Trans>Copy</Trans>
				</SubTrigger>
				<SubContent>
					<Item
						onSelect={() => copyShareLink(`workspaces/${state.workspaceId}`)}
					>
						<LuLink className={icon} />
						<Trans>Copy link</Trans>
					</Item>
					<Item onSelect={actions.onCopyBranchName}>
						<LuGitBranch className={icon} />
						<Trans>Copy Branch Name</Trans>
					</Item>
					{state.isLocalWorkspace && (
						<Item onSelect={actions.onCopyPath}>
							<LuClipboard className={icon} />
							<Trans>Copy Path</Trans>
						</Item>
					)}
					<Item onSelect={actions.onCopyWorkspaceId}>
						<LuHash className={icon} />
						<Trans>Copy Workspace ID</Trans>
					</Item>
				</SubContent>
			</Sub>
			<Separator />
			<Item onSelect={actions.onToggleUnread}>
				{state.isUnread ? (
					<>
						<LuEye className={icon} />
						<Trans>Mark as Read</Trans>
					</>
				) : (
					<>
						<LuEyeOff className={icon} />
						<Trans>Mark as Unread</Trans>
					</>
				)}
			</Item>
			{state.hasStatus && !state.isCloudWorkspace && (
				<Item onSelect={actions.onClearStatus}>
					<LuBellOff className={icon} />
					<Trans>Clear Status</Trans>
				</Item>
			)}
			{state.hasPullRequest && !state.isCloudWorkspace && (
				<Item onSelect={actions.onRemovePullRequest}>
					<LuUnlink className={icon} />
					<Trans>Remove PR Link</Trans>
				</Item>
			)}
			{groupItems}
			{move && (
				<>
					<Separator />
					<Sub>
						<SubTrigger>
							<LuArrowRightLeft className={icon} />
							<Trans>Move to</Trans>
						</SubTrigger>
						<SubContent>
							<MoveToDestinationItems
								item={Item}
								iconClassName={parts.iconClassName}
								directions={move.directions}
								fromHostId={move.fromHostId}
								onPick={move.onPick}
							/>
						</SubContent>
					</Sub>
				</>
			)}
			<Separator />
			{actions.onRemoveFromSidebar && (
				<Item onSelect={actions.onRemoveFromSidebar}>
					<LuX className={icon} />
					<Trans>Remove from Sidebar</Trans>
				</Item>
			)}
			{ports.length > 0 && (
				<Item
					onSelect={() => {
						if (!isKillingPorts) void killPorts(ports);
					}}
					disabled={isKillingPorts}
					variant="destructive"
				>
					<LuRadioTower className={icon} />
					<Trans>Close all ports</Trans>
				</Item>
			)}
			{actions.onDelete && (
				<Item
					onSelect={actions.onDelete}
					className="text-destructive focus:text-destructive"
				>
					{state.isCloudWorkspace ? (
						<>
							<LuArchive className={cn(icon, "text-destructive")} />
							<Trans>Archive</Trans>
						</>
					) : (
						<>
							<LuTrash2 className={cn(icon, "text-destructive")} />
							<Trans>Delete</Trans>
						</>
					)}
					{showDeleteShortcut && <Shortcut>{deleteHotkeyText}</Shortcut>}
				</Item>
			)}
		</>
	);
}
