import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	ChevronRight,
	Clipboard,
	FolderOpen,
	GitBranch,
	GitMerge,
	Plus,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Tab, TabGroup, Worktree } from "shared/types";
import { TabItem } from "./components/TabItem";

// Sortable wrapper for tabs
function SortableTab({
	tab,
	worktreeId,
	tabGroupId,
	selectedTabId,
	onTabSelect,
	onTabRemove,
}: {
	tab: Tab;
	worktreeId: string;
	tabGroupId: string;
	selectedTabId?: string;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
	onTabRemove: (tabId: string) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: tab.id,
		data: {
			type: "tab",
			tabGroupId,
		},
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<TabItem
				tab={tab}
				worktreeId={worktreeId}
				tabGroupId={tabGroupId}
				selectedTabId={selectedTabId}
				onTabSelect={onTabSelect}
				onTabRemove={onTabRemove}
			/>
		</div>
	);
}

interface WorktreeItemProps {
	worktree: Worktree;
	workspaceId: string;
	isExpanded: boolean;
	onToggle: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
	onReload: () => void;
	onUpdateWorktree: (updatedWorktree: Worktree) => void;
	selectedTabId: string | undefined;
}

export function WorktreeItem({
	worktree,
	workspaceId,
	isExpanded,
	onToggle,
	onTabSelect,
	onReload,
	onUpdateWorktree,
	selectedTabId,
}: WorktreeItemProps) {
	// Track active drag state
	const [activeId, setActiveId] = useState<string | null>(null);
	const [overId, setOverId] = useState<string | null>(null);

	// Track if merge is disabled (when this is the active worktree)
	const [isMergeDisabled, setIsMergeDisabled] = useState(false);
	const [mergeDisabledReason, setMergeDisabledReason] = useState<string>("");
	const [targetBranch, setTargetBranch] = useState<string>("");

	// Check if merge should be disabled on mount and get target branch
	useEffect(() => {
		const checkMergeStatus = async () => {
			// Get the workspace to find the active worktree
			const workspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			);

			if (workspace) {
				const activeWorktree = workspace.worktrees.find(
					(wt: { id: string }) => wt.id === workspace.activeWorktreeId,
				);
				if (activeWorktree) {
					setTargetBranch(activeWorktree.branch);
				}
			}

			const canMergeResult = await window.ipcRenderer.invoke(
				"worktree-can-merge",
				{
					workspaceId,
					worktreeId: worktree.id,
				},
			);

			if (canMergeResult.success && canMergeResult.isActiveWorktree) {
				setIsMergeDisabled(true);
				setMergeDisabledReason(canMergeResult.reason || "Active worktree");
			} else {
				setIsMergeDisabled(false);
				setMergeDisabledReason("");
			}
		};

		checkMergeStatus();
	}, [workspaceId, worktree.id]);

	// Configure sensors for drag-and-drop
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
	};

	const handleDragOver = (event: DragOverEvent) => {
		setOverId(event.over?.id as string | null);
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveId(null);
		setOverId(null);

		if (!over || active.id === over.id) {
			return;
		}

		const activeData = active.data.current;
		const overData = over.data.current;

		// Only handle tab dragging (not tab groups)
		if (activeData?.type !== "tab") {
			return;
		}

		try {
			// Handle tab reordering within the same tab group
			if (
				overData?.type === "tab" &&
				activeData.tabGroupId === overData.tabGroupId
			) {
				const tabGroup = worktree.tabGroups.find(
					(tg) => tg.id === activeData.tabGroupId,
				);
				if (!tabGroup) return;

				const oldIndex = tabGroup.tabs.findIndex((t) => t.id === active.id);
				const newIndex = tabGroup.tabs.findIndex((t) => t.id === over.id);

				// Optimistic update: update the local state immediately
				const reorderedTabs = arrayMove(tabGroup.tabs, oldIndex, newIndex);

				// Recalculate grid positions based on new array order
				const tabsWithUpdatedPositions = reorderedTabs.map((tab, index) => {
					const row = Math.floor(index / tabGroup.cols);
					const col = index % tabGroup.cols;
					return { ...tab, row, col };
				});

				const updatedTabGroup = { ...tabGroup, tabs: tabsWithUpdatedPositions };
				const updatedTabGroups = worktree.tabGroups.map((tg) =>
					tg.id === activeData.tabGroupId ? updatedTabGroup : tg,
				);
				const updatedWorktree = { ...worktree, tabGroups: updatedTabGroups };
				onUpdateWorktree(updatedWorktree);

				// Save to backend
				const newOrder = reorderedTabs.map((t) => t.id);
				const result = await window.ipcRenderer.invoke("tab-reorder", {
					workspaceId,
					worktreeId: worktree.id,
					tabGroupId: activeData.tabGroupId,
					tabIds: newOrder,
				});

				if (!result.success) {
					console.error("Failed to reorder tabs:", result.error);
					// Revert on failure
					onReload();
				}
			}
			// Handle moving tab to a different tab group
			else if (
				overData?.type === "tab-group" &&
				activeData.tabGroupId !== over.id
			) {
				// Moving to a different tab group
				const sourceTabGroup = worktree.tabGroups.find(
					(tg) => tg.id === activeData.tabGroupId,
				);
				const targetTabGroup = worktree.tabGroups.find(
					(tg) => tg.id === over.id,
				);
				if (!sourceTabGroup || !targetTabGroup) return;

				const tabToMove = sourceTabGroup.tabs.find((t) => t.id === active.id);
				if (!tabToMove) return;

				// Optimistic update
				const updatedSourceTabs = sourceTabGroup.tabs
					.filter((t) => t.id !== active.id)
					.map((tab, index) => {
						const row = Math.floor(index / sourceTabGroup.cols);
						const col = index % sourceTabGroup.cols;
						return { ...tab, row, col };
					});

				const updatedTargetTabs = [...targetTabGroup.tabs, tabToMove].map(
					(tab, index) => {
						const row = Math.floor(index / targetTabGroup.cols);
						const col = index % targetTabGroup.cols;
						return { ...tab, row, col };
					},
				);

				const updatedTabGroups = worktree.tabGroups.map((tg) => {
					if (tg.id === activeData.tabGroupId) {
						return { ...tg, tabs: updatedSourceTabs };
					}
					if (tg.id === over.id) {
						return { ...tg, tabs: updatedTargetTabs };
					}
					return tg;
				});

				const updatedWorktree = { ...worktree, tabGroups: updatedTabGroups };
				onUpdateWorktree(updatedWorktree);

				// Save to backend
				const result = await window.ipcRenderer.invoke("tab-move-to-group", {
					workspaceId,
					worktreeId: worktree.id,
					tabId: active.id as string,
					sourceTabGroupId: activeData.tabGroupId,
					targetTabGroupId: over.id as string,
					targetIndex: targetTabGroup.tabs.length,
				});

				if (!result.success) {
					console.error("Failed to move tab:", result.error);
					onReload();
				}
			}
			// Handle moving tab between tabs in different groups
			else if (
				overData?.type === "tab" &&
				activeData.tabGroupId !== overData.tabGroupId
			) {
				const sourceTabGroup = worktree.tabGroups.find(
					(tg) => tg.id === activeData.tabGroupId,
				);
				const targetTabGroup = worktree.tabGroups.find(
					(tg) => tg.id === overData.tabGroupId,
				);
				if (!sourceTabGroup || !targetTabGroup) return;

				const tabToMove = sourceTabGroup.tabs.find((t) => t.id === active.id);
				if (!tabToMove) return;

				const targetIndex = targetTabGroup.tabs.findIndex(
					(t) => t.id === over.id,
				);

				// Optimistic update
				const updatedSourceTabs = sourceTabGroup.tabs
					.filter((t) => t.id !== active.id)
					.map((tab, index) => {
						const row = Math.floor(index / sourceTabGroup.cols);
						const col = index % sourceTabGroup.cols;
						return { ...tab, row, col };
					});

				const updatedTargetTabsTemp = [...targetTabGroup.tabs];
				updatedTargetTabsTemp.splice(targetIndex, 0, tabToMove);
				const updatedTargetTabs = updatedTargetTabsTemp.map((tab, index) => {
					const row = Math.floor(index / targetTabGroup.cols);
					const col = index % targetTabGroup.cols;
					return { ...tab, row, col };
				});

				const updatedTabGroups = worktree.tabGroups.map((tg) => {
					if (tg.id === activeData.tabGroupId) {
						return { ...tg, tabs: updatedSourceTabs };
					}
					if (tg.id === overData.tabGroupId) {
						return { ...tg, tabs: updatedTargetTabs };
					}
					return tg;
				});

				const updatedWorktree = { ...worktree, tabGroups: updatedTabGroups };
				onUpdateWorktree(updatedWorktree);

				// Save to backend
				const result = await window.ipcRenderer.invoke("tab-move-to-group", {
					workspaceId,
					worktreeId: worktree.id,
					tabId: active.id as string,
					sourceTabGroupId: activeData.tabGroupId,
					targetTabGroupId: overData.tabGroupId,
					targetIndex,
				});

				if (!result.success) {
					console.error("Failed to move tab:", result.error);
					onReload();
				}
			}
		} catch (error) {
			console.error("Error during drag end:", error);
		}
	};

	// Get active item for drag overlay
	const activeItem = activeId
		? worktree.tabGroups
				.flatMap((tg) => tg.tabs)
				.find((t) => t.id === activeId) ||
			worktree.tabGroups.find((tg) => tg.id === activeId)
		: null;

	// Context menu handlers
	const handleCopyPath = async () => {
		const path = await window.ipcRenderer.invoke("worktree-get-path", {
			workspaceId,
			worktreeId: worktree.id,
		});
		if (path) {
			navigator.clipboard.writeText(path);
		}
	};

	const handleRemoveWorktree = async () => {
		if (
			confirm(
				`Are you sure you want to remove the worktree "${worktree.branch}"?`,
			)
		) {
			const result = await window.ipcRenderer.invoke("worktree-remove", {
				workspaceId,
				worktreeId: worktree.id,
			});

			if (result.success) {
				onReload();
			} else {
				alert(`Failed to remove worktree: ${result.error}`);
			}
		}
	};

	const handleMergeWorktree = async () => {
		// Check if can merge first
		const canMergeResult = await window.ipcRenderer.invoke(
			"worktree-can-merge",
			{
				workspaceId,
				worktreeId: worktree.id,
			},
		);

		if (!canMergeResult.success) {
			alert(`Error: ${canMergeResult.error}`);
			return;
		}

		if (!canMergeResult.canMerge) {
			alert(`Cannot merge: ${canMergeResult.reason || "Unknown error"}`);
			return;
		}

		const branchText = targetBranch
			? ` into "${targetBranch}"`
			: " into the active worktree";

		// Build confirmation message with warning if there are uncommitted changes
		let confirmMessage = `Are you sure you want to merge "${worktree.branch}"${branchText}?`;
		if (canMergeResult.hasUncommittedChanges) {
			confirmMessage +=
				"\n\nWarning: The target worktree has uncommitted changes. The merge will proceed anyway.";
		}

		if (confirm(confirmMessage)) {
			const result = await window.ipcRenderer.invoke("worktree-merge", {
				workspaceId,
				worktreeId: worktree.id,
			});

			if (result.success) {
				alert("Merge successful!");
				onReload();
			} else {
				alert(`Failed to merge: ${result.error}`);
			}
		}
	};

	const handleAddTab = async () => {
		// Get the first tab group (or use a default if none exist)
		const tabGroup = worktree.tabGroups[0];
		if (!tabGroup) {
			console.error("No tab group found for worktree");
			return;
		}

		// Calculate next tab position in grid
		const nextOrder = tabGroup.tabs.length;
		const row = Math.floor(nextOrder / tabGroup.cols);
		const col = nextOrder % tabGroup.cols;

		try {
			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId,
				worktreeId: worktree.id,
				tabGroupId: tabGroup.id,
				name: `Terminal ${tabGroup.tabs.length + 1}`,
				type: "terminal",
				row,
				col,
			});

			if (result.success) {
				const newTabId = result.tab?.id;
				onReload();
				// Auto-select the new tab if we have its ID
				if (newTabId) {
					onTabSelect(worktree.id, tabGroup.id, newTabId);
				}
			} else {
				console.error("Failed to create tab:", result.error);
			}
		} catch (error) {
			console.error("Error creating tab:", error);
		}
	};

	const handleTabRemove = async (tabId: string) => {
		try {
			const result = await window.ipcRenderer.invoke("tab-delete", {
				workspaceId,
				worktreeId: worktree.id,
				tabId,
			});

			if (result.success) {
				onReload(); // Refresh the workspace to show the updated tab list
			} else {
				console.error("Failed to delete tab:", result.error);
			}
		} catch (error) {
			console.error("Error deleting tab:", error);
		}
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
			<div className="space-y-1">
				{/* Worktree Header */}
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onToggle(worktree.id)}
							className="w-full h-8 px-3 pb-1 font-normal"
							style={{ justifyContent: "flex-start" }}
						>
							<ChevronRight
								size={12}
								className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
							/>
							<GitBranch size={14} className="opacity-70" />
							<span className="truncate flex-1 text-left">
								{worktree.branch}
							</span>
						</Button>
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem
							onClick={handleMergeWorktree}
							disabled={isMergeDisabled}
						>
							<GitMerge size={14} className="mr-2" />
							{isMergeDisabled
								? `Merge Worktree (${mergeDisabledReason})`
								: targetBranch
									? `Merge into (${targetBranch})`
									: "Merge into Active Worktree"}
						</ContextMenuItem>
						<ContextMenuItem onClick={handleCopyPath}>
							<Clipboard size={14} className="mr-2" />
							Copy Path
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem
							onClick={handleRemoveWorktree}
							variant="destructive"
						>
							<Trash2 size={14} className="mr-2" />
							Remove Worktree
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>

				{/* Tabs List */}
				{isExpanded && (
					<div className="ml-6 space-y-1">
						{/* Render all tabs from all tab groups */}
						<SortableContext
							items={worktree.tabGroups.flatMap((tg) =>
								tg.tabs.map((t) => t.id),
							)}
							strategy={verticalListSortingStrategy}
						>
							{worktree.tabGroups.flatMap((tabGroup) =>
								tabGroup.tabs.map((tab) => (
									<SortableTab
										key={tab.id}
										tab={tab}
										worktreeId={worktree.id}
										tabGroupId={tabGroup.id}
										selectedTabId={selectedTabId}
										onTabSelect={onTabSelect}
										onTabRemove={handleTabRemove}
									/>
								)),
							)}
						</SortableContext>

						{/* New Tab Button */}
						<Button
							variant="ghost"
							size="sm"
							onClick={handleAddTab}
							className="w-full h-8 px-3 font-normal opacity-70 hover:opacity-100"
							style={{ justifyContent: "flex-start" }}
						>
							<Plus size={14} />
							<span className="truncate">New Tab</span>
						</Button>
					</div>
				)}
			</div>

			<DragOverlay>
				{activeItem ? (
					<div className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm opacity-90">
						{"name" in activeItem ? activeItem.name : "Tab Group"}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
