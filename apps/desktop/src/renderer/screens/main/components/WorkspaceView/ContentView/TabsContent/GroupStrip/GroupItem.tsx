import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";
import { HiMiniXMark } from "react-icons/hi2";
import { LuEyeOff, LuPencil } from "react-icons/lu";
import { MosaicDragType } from "react-mosaic-component";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import { useDragPaneStore } from "renderer/stores/drag-pane-store";
import type { PaneStatus, Tab } from "renderer/stores/tabs/types";
import { getTabDisplayName } from "renderer/stores/tabs/utils";

export const TAB_TYPE = "TAB";

interface GroupItemProps {
	tab: Tab;
	index: number;
	isActive: boolean;
	status: PaneStatus | null;
	onSelect: () => void;
	onClose: () => void;
	onRename: (newName: string) => void;
	onMarkAsUnread: () => void;
	onPaneDrop?: (paneId: string) => void;
	onReorder?: (fromIndex: number, toIndex: number) => void;
}

export function GroupItem({
	tab,
	index,
	isActive,
	status,
	onSelect,
	onClose,
	onRename,
	onMarkAsUnread,
	onPaneDrop,
	onReorder,
}: GroupItemProps) {
	const displayName = getTabDisplayName(tab);
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState("");

	// Drag source for tab reordering
	const [{ isDragging }, drag, preview] = useDrag(
		() => ({
			type: TAB_TYPE,
			item: { tabId: tab.id, index },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[tab.id, index],
	);

	// Hide the default browser drag preview to prevent snap-back animation
	useEffect(() => {
		preview(getEmptyImage(), { captureDraggingState: true });
	}, [preview]);

	// Drop target for pane drops AND tab reordering
	const [{ isOver, canDrop }, drop] = useDrop<
		{ tabId?: string; index?: number },
		{ handled: true },
		{ isOver: boolean; canDrop: boolean }
	>(
		() => ({
			accept: [MosaicDragType.WINDOW, TAB_TYPE],
			canDrop: (_item, monitor) => {
				const itemType = monitor.getItemType();
				if (itemType === TAB_TYPE) {
					// Tab reordering - can drop on any other tab
					const item = monitor.getItem() as { tabId: string; index: number };
					return item.tabId !== tab.id;
				}
				// Pane drop
				const { draggingPaneId, draggingSourceTabId } =
					useDragPaneStore.getState();
				return (
					!!draggingPaneId &&
					!!draggingSourceTabId &&
					draggingSourceTabId !== tab.id
				);
			},
			hover: (item, monitor) => {
				const itemType = monitor.getItemType();
				if (
					itemType === TAB_TYPE &&
					item.index !== undefined &&
					item.index !== index
				) {
					onReorder?.(item.index, index);
					item.index = index;
				}
			},
			drop: (_item, monitor) => {
				const itemType = monitor.getItemType();
				if (itemType === TAB_TYPE) {
					// Tab reorder is handled in hover
					return { handled: true };
				}
				// Pane drop
				const { draggingPaneId, draggingSourceTabId, clearDragging } =
					useDragPaneStore.getState();
				if (
					draggingPaneId &&
					draggingSourceTabId &&
					draggingSourceTabId !== tab.id
				) {
					onPaneDrop?.(draggingPaneId);
				}
				clearDragging();
				return { handled: true };
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
				canDrop: monitor.canDrop(),
			}),
		}),
		[onPaneDrop, onReorder, tab.id, index],
	);

	const tabStyles = cn(
		"flex items-center gap-2 transition-all w-full shrink-0 pl-3 pr-8 h-full",
		isActive
			? "text-foreground bg-border/30"
			: "text-muted-foreground/70 hover:text-muted-foreground hover:bg-tertiary/20",
	);

	const startEditing = () => {
		setEditValue(displayName);
		setIsEditing(true);
	};

	const handleSave = () => {
		const trimmedValue = editValue.trim();
		if (trimmedValue && trimmedValue !== displayName) {
			onRename(trimmedValue);
		}
		setIsEditing(false);
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					ref={(node) => {
						drag(drop(node));
					}}
					className={cn(
						"group relative flex items-center shrink-0 h-full border-r border-border",
						isOver && canDrop && "bg-primary/5",
						isDragging && "opacity-50 text-muted-foreground/50",
					)}
					style={{ cursor: isDragging ? "grabbing" : undefined }}
				>
					{isEditing ? (
						<div className="flex h-full w-full shrink-0 items-center px-2">
							<RenameInput
								value={editValue}
								onChange={setEditValue}
								onSubmit={handleSave}
								onCancel={() => setIsEditing(false)}
								maxLength={64}
								className="text-sm w-full min-w-0 px-1 py-0.5 rounded border border-border bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
							/>
						</div>
					) : (
						<>
							<button
								type="button"
								onClick={onSelect}
								onDoubleClick={startEditing}
								onAuxClick={(e) => {
									if (e.button === 1) {
										e.preventDefault();
										onClose();
									}
								}}
								className={tabStyles}
							>
								<span className="text-sm truncate flex-1 text-left">
									{displayName}
								</span>
								{status && status !== "idle" && (
									<StatusIndicator status={status} />
								)}
							</button>
							<div className="absolute right-1 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 group-hover:flex">
								<Tooltip delayDuration={500}>
									<TooltipTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={(e) => {
												e.stopPropagation();
												onClose();
											}}
											className="cursor-pointer size-6 hover:bg-muted"
											aria-label="Close pane"
										>
											<HiMiniXMark className="size-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top" showArrow={false}>
										Close pane
									</TooltipContent>
								</Tooltip>
							</div>
						</>
					)}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={startEditing}>
					<LuPencil className="size-4 mr-2" />
					Rename
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onMarkAsUnread}>
					<LuEyeOff className="size-4 mr-2" />
					Mark as Unread
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={onClose}>
					<HiMiniXMark className="size-4 mr-2" />
					Close
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
