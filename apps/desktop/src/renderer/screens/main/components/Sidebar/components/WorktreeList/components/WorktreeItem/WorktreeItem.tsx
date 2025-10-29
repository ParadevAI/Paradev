import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
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
	GitBranch,
	GitMerge,
	Plus,
	Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Tab, Worktree } from "shared/types";
import { TabItem } from "./components/TabItem";

// Sortable wrapper for tabs
function SortableTab({
	tab,
	worktreeId,
	parentTabId,
	selectedTabId,
	onTabSelect,
	onTabRemove,
}: {
	tab: Tab;
	worktreeId: string;
	parentTabId?: string; // Optional parent group tab ID
	selectedTabId?: string;
	onTabSelect: (worktreeId: string, tabId: string) => void;
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
			parentTabId,
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
	onTabSelect: (worktreeId: string, tabId: string) => void;
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

	// Track expanded group tabs
	const [expandedGroupTabs, setExpandedGroupTabs] = useState<Set<string>>(
		new Set(),
	);

	// Track if merge is disabled (when this is the active worktree)
	const [isMergeDisabled, setIsMergeDisabled] = useState(false);
	const [mergeDisabledReason, setMergeDisabledReason] = useState<string>("");
	const [targetBranch, setTargetBranch] = useState<string>("");

	// Auto-expand group tabs that contain the selected tab
	useEffect(() => {
		if (!selectedTabId) return;

		const tabs = Array.isArray(worktree.tabs) ? worktree.tabs : [];
		const parentGroupTab = findParentGroupTab(tabs, selectedTabId);

		if (parentGroupTab) {
			setExpandedGroupTabs((prev) => {
				const next = new Set(prev);
				next.add(parentGroupTab.id);
				return next;
			});
		}
	}, [selectedTabId, worktree.tabs]);

	// Helper: recursively find a tab by ID
	const findTabById = (tabs: Tab[], tabId: string): Tab | null => {
		for (const tab of tabs) {
			if (tab.id === tabId) return tab;
			if (tab.type === "group" && tab.tabs) {
				const found = findTabById(tab.tabs, tabId);
				if (found) return found;
			}
		}
		return null;
	};

	// Helper: recursively find parent group tab containing a specific tab
	const findParentGroupTab = (tabs: Tab[], tabId: string): Tab | null => {
		for (const tab of tabs) {
			if (tab.type === "group" && tab.tabs) {
				if (tab.tabs.some((t) => t.id === tabId)) return tab;
				const found = findParentGroupTab(tab.tabs, tabId);
				if (found) return found;
			}
		}
		return null;
	};

	// Helper: recursively get all tabs as flat array with their parent IDs
	const getAllTabs = (
		tabs: Tab[],
		parentTabId?: string,
	): Array<{ tab: Tab; parentTabId?: string }> => {
		const result: Array<{ tab: Tab; parentTabId?: string }> = [];
		for (const tab of tabs) {
			result.push({ tab, parentTabId });
			if (tab.type === "group" && tab.tabs) {
				result.push(...getAllTabs(tab.tabs, tab.id));
			}
		}
		return result;
	};

	// Helper: recalculate positions after reorder
	const recalculatePositions = (tabs: Tab[], cols: number): Tab[] => {
		return tabs.map((tab, index) => {
			const row = Math.floor(index / cols);
			const col = index % cols;
			return { ...tab, order: index, row, col };
		});
	};

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

			if (canMergeResult.isActiveWorktree) {
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

		// Only handle tab dragging
		if (activeData?.type !== "tab") {
			return;
		}

		try {
			const activeParentTabId = activeData.parentTabId;
			const overParentTabId = overData?.parentTabId;

			// Reordering within the same parent group
			if (overData?.type === "tab" && activeParentTabId === overParentTabId) {
				const parentTab = activeParentTabId
					? findTabById(tabs, activeParentTabId)
					: null;

				// If no parent, we're reordering top-level tabs
				const tabsArray = parentTab?.tabs || tabs;
				const cols = parentTab?.cols || 2;

				const oldIndex = tabsArray.findIndex((t) => t.id === active.id);
				const newIndex = tabsArray.findIndex((t) => t.id === over.id);

				if (oldIndex === -1 || newIndex === -1) return;

				// Optimistic update
				const reorderedTabs = arrayMove(tabsArray, oldIndex, newIndex);
				const tabsWithUpdatedPositions = recalculatePositions(
					reorderedTabs,
					cols,
				);

				// Update worktree state
				let updatedWorktree: Worktree;
				if (parentTab) {
					// Update nested tabs
					const updateTabsRecursive = (tabs: Tab[]): Tab[] => {
						return tabs.map((tab) => {
							if (tab.id === parentTab.id) {
								return { ...tab, tabs: tabsWithUpdatedPositions };
							}
							if (tab.type === "group" && tab.tabs) {
								return { ...tab, tabs: updateTabsRecursive(tab.tabs) };
							}
							return tab;
						});
					};
					updatedWorktree = {
						...worktree,
						tabs: updateTabsRecursive(worktree.tabs),
					};
				} else {
					// Update top-level tabs
					updatedWorktree = { ...worktree, tabs: tabsWithUpdatedPositions };
				}

				onUpdateWorktree(updatedWorktree);

				// Save to backend
				const newOrder = reorderedTabs.map((t) => t.id);
				const result = await window.ipcRenderer.invoke("tab-reorder", {
					workspaceId,
					worktreeId: worktree.id,
					parentTabId: activeParentTabId,
					tabIds: newOrder,
				});

				if (!result.success) {
					console.error("Failed to reorder tabs:", result.error);
					onReload();
				}
			}
			// Moving to a different parent group
			else if (
				overData?.type === "tab" &&
				activeParentTabId !== overParentTabId
			) {
				// For now, we'll just trigger a reload instead of implementing complex cross-group moves
				// This can be enhanced later if needed
				console.log(
					"Cross-group tab movement not yet supported in sidebar drag-and-drop",
				);
			}
		} catch (error) {
			console.error("Error during drag end:", error);
		}
	};

	// Get active item for drag overlay
	const activeItem = activeId ? findTabById(worktree.tabs, activeId) : null;

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
		// Get the first top-level group tab
		const firstGroupTab = worktree.tabs.find((t) => t.type === "group");
		if (!firstGroupTab || !firstGroupTab.tabs) {
			console.error("No group tab found for worktree");
			return;
		}

		// Calculate next tab position in grid
		const nextOrder = firstGroupTab.tabs.length;
		const cols = firstGroupTab.cols || 2;
		const row = Math.floor(nextOrder / cols);
		const col = nextOrder % cols;

		try {
			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId,
				worktreeId: worktree.id,
				parentTabId: firstGroupTab.id,
				name: `Terminal ${firstGroupTab.tabs.length + 1}`,
				type: "terminal",
				row,
				col,
			});

			if (result.success) {
				const newTabId = result.tab?.id;
				onReload();
				// Auto-select the new tab if we have its ID
				if (newTabId) {
					onTabSelect(worktree.id, newTabId);
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

	// Get all tabs for sortable context (including nested)
	// Defensive: ensure worktree.tabs exists and is an array
	const tabs = Array.isArray(worktree.tabs) ? worktree.tabs : [];
	const allTabsFlat = getAllTabs(tabs);
	const allTabIds = allTabsFlat.map((item) => item.tab.id);

	// Toggle group tab expansion
	const toggleGroupTab = (groupTabId: string) => {
		setExpandedGroupTabs((prev) => {
			const next = new Set(prev);
			if (next.has(groupTabId)) {
				next.delete(groupTabId);
			} else {
				next.add(groupTabId);
			}
			return next;
		});
	};

	// Render a single tab or group tab with nesting
	const renderTab = (tab: Tab, parentTabId?: string, level = 0) => {
		if (tab.type === "group") {
			const isExpanded = expandedGroupTabs.has(tab.id);
			return (
				<div key={tab.id} className="space-y-1">
					{/* Group Tab Header */}
					<Button
						variant="ghost"
						size="sm"
						onClick={() => toggleGroupTab(tab.id)}
						className="w-full h-8 px-3 pb-1 font-normal"
						style={{ justifyContent: "flex-start", paddingLeft: `${level * 12 + 12}px` }}
					>
						<ChevronRight
							size={12}
							className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
						/>
						<span className="truncate flex-1 text-left">{tab.name}</span>
					</Button>

					{/* Nested Tabs */}
					{isExpanded && tab.tabs && (
						<div className="space-y-1">
							{tab.tabs.map((childTab) =>
								renderTab(childTab, tab.id, level + 1),
							)}
						</div>
					)}
				</div>
			);
		}

		// Regular tab (terminal, editor, etc.)
		return (
			<div
				key={tab.id}
				style={{ paddingLeft: `${level * 12}px` }}
			>
				<SortableTab
					tab={tab}
					worktreeId={worktree.id}
					parentTabId={parentTabId}
					selectedTabId={selectedTabId}
					onTabSelect={onTabSelect}
					onTabRemove={handleTabRemove}
				/>
			</div>
		);
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
						{/* Render tabs with collapsible groups */}
						<SortableContext
							items={allTabIds}
							strategy={verticalListSortingStrategy}
						>
							{tabs.map((tab) => renderTab(tab, undefined, 0))}
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

			{/* Drag Overlay */}
			{activeItem && (
				<div className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm opacity-90">
					{activeItem.name}
				</div>
			)}
		</DndContext>
	);
}
