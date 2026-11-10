import { Trans } from "@lingui/react/macro";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import type { ReactNode } from "react";
import {
	LuArchive,
	LuArchiveRestore,
	LuClock,
	LuLink,
	LuPause,
	LuPencil,
	LuPlay,
	LuTrash2,
} from "react-icons/lu";
import { AutomationGroupMenuItems } from "../../../AutomationGroupMenuItems";

interface AutomationActionsMenuItemsProps {
	kind: "context" | "dropdown";
	isOwner: boolean;
	/** Owner or organization owner: archiving runs nothing on anyone's machine. */
	canArchive: boolean;
	archived: boolean;
	enabled: boolean;
	groups: string[];
	currentGroup: string | null;
	onEdit: () => void;
	onCopyLink: () => void;
	onRunNow: () => void;
	onToggleEnabled: () => void;
	onHistory: () => void;
	onMoveToGroup: (group: string | null) => void;
	onArchive: () => void;
	onRestore: () => void;
	onDelete: () => void;
}

export function AutomationActionsMenuItems({
	kind,
	isOwner,
	canArchive,
	archived,
	enabled,
	groups,
	currentGroup,
	onEdit,
	onCopyLink,
	onRunNow,
	onToggleEnabled,
	onHistory,
	onMoveToGroup,
	onArchive,
	onRestore,
	onDelete,
}: AutomationActionsMenuItemsProps) {
	const renderItem = ({
		children,
		destructive = false,
		onSelect,
	}: {
		children: ReactNode;
		destructive?: boolean;
		onSelect: () => void;
	}) => {
		const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem;
		return (
			<Item
				onSelect={onSelect}
				variant={destructive ? "destructive" : "default"}
			>
				{children}
			</Item>
		);
	};
	const separator =
		kind === "context" ? <ContextMenuSeparator /> : <DropdownMenuSeparator />;

	return (
		<>
			{renderItem({
				onSelect: onEdit,
				children: (
					<>
						<LuPencil className="size-4" />
						{isOwner && !archived ? <Trans>Edit</Trans> : <Trans>View</Trans>}
					</>
				),
			})}
			{renderItem({
				onSelect: onCopyLink,
				children: (
					<>
						<LuLink className="size-4" />
						<Trans>Copy link</Trans>
					</>
				),
			})}
			{isOwner && !archived && (
				<>
					{renderItem({
						onSelect: onRunNow,
						children: (
							<>
								<LuPlay className="size-4" />
								<Trans>Run now</Trans>
							</>
						),
					})}
					{renderItem({
						onSelect: onToggleEnabled,
						children: enabled ? (
							<>
								<LuPause className="size-4" />
								<Trans>Pause</Trans>
							</>
						) : (
							<>
								<LuPlay className="size-4" />
								<Trans>Resume</Trans>
							</>
						),
					})}
					{renderItem({
						onSelect: onHistory,
						children: (
							<>
								<LuClock className="size-4" />
								<Trans>Prompt history</Trans>
							</>
						),
					})}
					<AutomationGroupMenuItems
						kind={kind}
						groups={groups}
						currentGroup={currentGroup}
						onMove={onMoveToGroup}
					/>
				</>
			)}
			{canArchive && (
				<>
					{separator}
					{archived ? (
						<>
							{renderItem({
								onSelect: onRestore,
								children: (
									<>
										<LuArchiveRestore className="size-4" />
										<Trans>Restore</Trans>
									</>
								),
							})}
							{renderItem({
								destructive: true,
								onSelect: onDelete,
								children: (
									<>
										<LuTrash2 className="size-4" />
										<Trans>Delete permanently</Trans>
									</>
								),
							})}
						</>
					) : (
						renderItem({
							onSelect: onArchive,
							children: (
								<>
									<LuArchive className="size-4" />
									<Trans>Archive</Trans>
								</>
							),
						})
					)}
				</>
			)}
		</>
	);
}
