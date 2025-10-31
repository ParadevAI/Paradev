import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useState } from "react";
import type { MosaicNode, Tab, Workspace } from "shared/types";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import TabContent from "./components/MainContent/TabContent";
import TabGroup from "./components/MainContent/TabGroup";
import { PlaceholderState } from "./components/PlaceholderState";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

// Droppable wrapper for main content area
function DroppableMainContent({
	children,
	isOver,
}: {
	children: React.ReactNode;
	isOver: boolean;
}) {
	const { setNodeRef } = useDroppable({
		id: "main-content-drop-zone",
		data: {
			type: "main-content",
		},
	});

	return (
		<div
			ref={setNodeRef}
			className={`flex-1 overflow-hidden m-1 rounded-lg relative ${
				isOver ? "ring-2 ring-blue-500 ring-inset" : ""
			}`}
		>
			{children}
			{isOver && (
				<div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center">
					<div className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
						Drop to add to split view
					</div>
				</div>
			)}
		</div>
	);
}

export function MainScreen() {
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
	const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
		null,
	);
	const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(
		null,
	);
	const [selectedTabId, setSelectedTabId] = useState<string | null>(null); // Can be a group tab or any tab
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Drag and drop state
	const [activeId, setActiveId] = useState<string | null>(null);
	const [isOverMainContent, setIsOverMainContent] = useState(false);

	const selectedWorktree = currentWorkspace?.worktrees?.find(
		(wt) => wt.id === selectedWorktreeId,
	);

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

	// Helper function to find a tab recursively (for finding sub-tabs inside groups)
	const findTabRecursive = (
		tabs: Tab[] | undefined,
		tabId: string,
	): { tab: Tab; parent?: Tab } | null => {
		if (!tabs) return null;

		for (const tab of tabs) {
			if (tab.id === tabId) {
				return { tab };
			}
			// Check if this tab is a group tab with children
			if (tab.type === "group" && tab.tabs) {
				for (const childTab of tab.tabs) {
					if (childTab.id === tabId) {
						return { tab: childTab, parent: tab };
					}
				}
			}
		}
		return null;
	};

	// Get selected tab and its parent (if it's a sub-tab)
	const tabResult = selectedWorktree?.tabs
		? findTabRecursive(selectedWorktree.tabs, selectedTabId ?? "")
		: null;

	const selectedTab = tabResult?.tab;
	const parentGroupTab = tabResult?.parent;

	const handleTabSelect = (worktreeId: string, tabId: string) => {
		setSelectedWorktreeId(worktreeId);
		setSelectedTabId(tabId);
		// Save active selection and update workspace state
		if (currentWorkspace) {
			window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId,
				tabId,
			});
			// Update the current workspace state to reflect the new active selection
			setCurrentWorkspace({
				...currentWorkspace,
				activeWorktreeId: worktreeId,
				activeTabId: tabId,
			});
		}
	};

	const handleTabFocus = (tabId: string) => {
		// When a terminal gets focus, update the selected tab
		if (!currentWorkspace || !selectedWorktreeId) return;

		setSelectedTabId(tabId);
		// Save active selection and update workspace state
		window.ipcRenderer.invoke("workspace-set-active-selection", {
			workspaceId: currentWorkspace.id,
			worktreeId: selectedWorktreeId,
			tabId,
		});
		// Update the current workspace state to reflect the new active selection
		setCurrentWorkspace({
			...currentWorkspace,
			activeWorktreeId: selectedWorktreeId,
			activeTabId: tabId,
		});
	};

	const handleWorkspaceSelect = async (workspaceId: string) => {
		try {
			const workspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			);

			if (workspace) {
				setCurrentWorkspace(workspace);
				// Persist the active workspace
				await window.ipcRenderer.invoke(
					"workspace-set-active-workspace-id",
					workspaceId,
				);
				// Restore the active selection for this workspace
				const activeSelection = await window.ipcRenderer.invoke(
					"workspace-get-active-selection",
					workspaceId,
				);

				if (activeSelection?.worktreeId && activeSelection?.tabId) {
					setSelectedWorktreeId(activeSelection.worktreeId);
					setSelectedTabId(activeSelection.tabId);
				} else {
					// No saved selection, reset
					setSelectedWorktreeId(null);
					setSelectedTabId(null);
				}
			}
		} catch (error) {
			console.error("Failed to load workspace:", error);
		}
	};

	const handleWorktreeCreated = async () => {
		// Refresh workspace data after worktree creation
		if (!currentWorkspace) return;

		try {
			const refreshedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			);

			if (refreshedWorkspace) {
				setCurrentWorkspace(refreshedWorkspace);
				// Also refresh workspaces list
				await loadAllWorkspaces();
			}
		} catch (error) {
			console.error("Failed to refresh workspace:", error);
		}
	};

	const handleUpdateWorktree = (worktreeId: string, updatedWorktree: any) => {
		// Optimistically update the worktree in the current workspace
		if (!currentWorkspace) return;

		const updatedWorktrees = currentWorkspace.worktrees.map((wt) =>
			wt.id === worktreeId ? updatedWorktree : wt,
		);

		const updatedCurrentWorkspace = {
			...currentWorkspace,
			worktrees: updatedWorktrees,
		};

		setCurrentWorkspace(updatedCurrentWorkspace);

		// Also update the workspaces array so the carousel renders the updated data
		if (workspaces) {
			setWorkspaces(
				workspaces.map((ws) =>
					ws.id === currentWorkspace.id ? updatedCurrentWorkspace : ws,
				),
			);
		}
	};

	const loadAllWorkspaces = async () => {
		try {
			const allWorkspaces = await window.ipcRenderer.invoke("workspace-list");

			setWorkspaces(allWorkspaces);
		} catch (error) {
			console.error("Failed to load workspaces:", error);
		}
	};

	// Scan for existing worktrees when workspace is opened
	const scanWorktrees = async (workspaceId: string) => {
		try {
			const result = await window.ipcRenderer.invoke(
				"workspace-scan-worktrees",
				workspaceId,
			);

			if (result.success && result.imported && result.imported > 0) {
				console.log("[MainScreen] Imported worktrees:", result.imported);
				// Refresh workspace data
				const refreshedWorkspace = await window.ipcRenderer.invoke(
					"workspace-get",
					workspaceId,
				);

				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
				}
			}
		} catch (error) {
			console.error("[MainScreen] Failed to scan worktrees:", error);
		}
	};

	// Load active workspace and all workspaces on mount
	useEffect(() => {
		const loadActiveWorkspace = async () => {
			try {
				setLoading(true);
				setError(null);

				// Load all workspaces
				await loadAllWorkspaces();

				// Try to load the active workspace first, fall back to last opened
				let workspaceId = await window.ipcRenderer.invoke(
					"workspace-get-active-workspace-id",
				);

				// Fall back to last opened if no active workspace
				if (!workspaceId) {
					const lastOpenedWorkspace = await window.ipcRenderer.invoke(
						"workspace-get-last-opened",
					);
					workspaceId = lastOpenedWorkspace?.id ?? null;
				}

				if (workspaceId) {
					const workspace = await window.ipcRenderer.invoke(
						"workspace-get",
						workspaceId,
					);

					if (workspace) {
						setCurrentWorkspace(workspace);
						// Scan for existing worktrees
						await scanWorktrees(workspace.id);

						// Restore active selection for this workspace
						const activeSelection = await window.ipcRenderer.invoke(
							"workspace-get-active-selection",
							workspaceId,
						);

						if (activeSelection?.worktreeId && activeSelection?.tabId) {
							setSelectedWorktreeId(activeSelection.worktreeId);
							setSelectedTabId(activeSelection.tabId);
						}
					}
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setLoading(false);
			}
		};

		loadActiveWorkspace();
	}, []);

	// Listen for workspace-opened event from menu
	useEffect(() => {
		const handler = async (workspace: Workspace) => {
			console.log("[MainScreen] Workspace opened event received:", workspace);
			setCurrentWorkspace(workspace);
			setLoading(false);
			// Persist the active workspace
			await window.ipcRenderer.invoke(
				"workspace-set-active-workspace-id",
				workspace.id,
			);
			// Refresh workspaces list
			await loadAllWorkspaces();
			// Scan for existing worktrees
			await scanWorktrees(workspace.id);
		};

		console.log("[MainScreen] Setting up workspace-opened listener");
		window.ipcRenderer.on("workspace-opened", handler);
		return () => {
			console.log("[MainScreen] Removing workspace-opened listener");
			window.ipcRenderer.off("workspace-opened", handler);
		};
	}, []);

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

	// Helper: Add tab ID to mosaic tree
	const addTabToMosaicTree = (
		tree: MosaicNode<string> | null | undefined,
		tabId: string,
	): MosaicNode<string> => {
		if (!tree) {
			return tabId;
		}

		if (typeof tree === "string") {
			// Single tab - create a split
			return {
				direction: "row",
				first: tree,
				second: tabId,
				splitPercentage: 50,
			};
		}

		// Tree node - add to the second branch
		return {
			...tree,
			second: addTabToMosaicTree(tree.second, tabId),
		};
	};

	// Drag and drop handlers
	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
		setIsOverMainContent(false);
	};

	const handleDragOver = (event: DragOverEvent) => {
		const overId = event.over?.id;
		setIsOverMainContent(overId === "main-content-drop-zone");
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveId(null);
		setIsOverMainContent(false);

		if (!over || active.id === over.id) return;

		const activeData = active.data.current;
		const overData = over.data.current;

		// Only handle tab dragging
		if (activeData?.type !== "tab") {
			return;
		}

		// Handle dropping onto the main content area
		if (over.id === "main-content-drop-zone") {
			const activeData = active.data.current;
			const draggedTabId = active.id as string;

			// Only handle tab dragging
			if (activeData?.type !== "tab") {
				return;
			}

			const draggedWorktreeId = activeData.worktreeId as string;

			// Check if the dragged tab is from the same worktree as the currently selected tab
			if (draggedWorktreeId !== selectedWorktreeId) {
				console.log(
					"[MainScreen] Cannot drop tab from different worktree onto main content",
				);
				return;
			}

			if (!currentWorkspace || !selectedWorktreeId) return;

			const worktree = currentWorkspace.worktrees.find(
				(wt) => wt.id === selectedWorktreeId,
			);
			if (!worktree) return;

			const draggedTab = findTabById(worktree.tabs, draggedTabId);
			if (!draggedTab || draggedTab.type === "group") {
				console.log("[MainScreen] Cannot drop group tabs onto main content");
				return;
			}

			// Case 1: Currently viewing a group tab - add the dragged tab to that group
			if (selectedTab?.type === "group") {
				try {
					const parentTabId = activeData.parentTabId;

					// Move the tab into the group
					const moveResult = await window.ipcRenderer.invoke("tab-move", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: draggedTabId,
						sourceParentTabId: parentTabId,
						targetParentTabId: selectedTab.id,
						targetIndex: selectedTab.tabs?.length || 0,
					});

					if (!moveResult.success) {
						console.error("[MainScreen] Failed to move tab:", moveResult.error);
						return;
					}

					// Update the mosaic tree to include the new tab
					const updatedMosaicTree = addTabToMosaicTree(
						selectedTab.mosaicTree,
						draggedTabId,
					);

					await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: selectedTab.id,
						mosaicTree: updatedMosaicTree,
					});

					// Refresh workspace to show the updated structure
					const refreshedWorkspace = await window.ipcRenderer.invoke(
						"workspace-get",
						currentWorkspace.id,
					);
					if (refreshedWorkspace) {
						setCurrentWorkspace(refreshedWorkspace);
					}
				} catch (error) {
					console.error("[MainScreen] Error adding tab to group:", error);
				}
			}
			// Case 2: Currently viewing a single tab - create a new group with both tabs
			else if (selectedTab) {
				try {
					// Create a new group tab
					const groupResult = await window.ipcRenderer.invoke("tab-create", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						name: "Tab Group",
						type: "group",
					});

					if (!groupResult.success || !groupResult.tab) {
						console.error(
							"[MainScreen] Failed to create group tab:",
							groupResult.error,
						);
						return;
					}

					const groupTabId = groupResult.tab.id;
					const parentTabId = activeData.parentTabId;

					// Move both tabs into the group
					// First, move the currently selected tab
					await window.ipcRenderer.invoke("tab-move", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: selectedTab.id,
						sourceParentTabId: undefined,
						targetParentTabId: groupTabId,
						targetIndex: 0,
					});

					// Then, move the dragged tab
					await window.ipcRenderer.invoke("tab-move", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: draggedTabId,
						sourceParentTabId: parentTabId,
						targetParentTabId: groupTabId,
						targetIndex: 1,
					});

					// Create a simple mosaic tree with both tabs
					const mosaicTree: MosaicNode<string> = {
						direction: "row",
						first: selectedTab.id,
						second: draggedTabId,
						splitPercentage: 50,
					};

					await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: groupTabId,
						mosaicTree,
					});

					// Select the new group tab to show the mosaic
					setSelectedTabId(groupTabId);
					await window.ipcRenderer.invoke("workspace-set-active-selection", {
						workspaceId: currentWorkspace.id,
						worktreeId: selectedWorktreeId,
						tabId: groupTabId,
					});

					// Refresh workspace to show the updated structure
					const refreshedWorkspace = await window.ipcRenderer.invoke(
						"workspace-get",
						currentWorkspace.id,
					);
					if (refreshedWorkspace) {
						setCurrentWorkspace(refreshedWorkspace);
					}
				} catch (error) {
					console.error("[MainScreen] Error creating tab group:", error);
				}
			}
			return;
		}

		// Handle sidebar drag operations (reordering, moving between groups)
		const draggedWorktreeId = activeData.worktreeId as string;
		const draggedTabId = active.id as string;
		const activeParentTabId = activeData.parentTabId;
		const overParentTabId = overData?.parentTabId;

		if (!currentWorkspace || !draggedWorktreeId) return;

		const worktree = currentWorkspace.worktrees.find(
			(wt) => wt.id === draggedWorktreeId,
		);
		if (!worktree) return;

		try {
			// Dropping onto a group tab or group area
			if (overData?.type === "group" || overData?.type === "group-area") {
				const groupTabId = overData.groupTabId as string;

				// Don't allow dropping a tab onto its own parent
				if (activeParentTabId === groupTabId) {
					return;
				}

				const draggedTab = findTabById(worktree.tabs, draggedTabId);
				const groupTab = findTabById(worktree.tabs, groupTabId);

				if (!draggedTab || !groupTab || groupTab.type !== "group") {
					console.error("[MainScreen] Invalid tab or group tab");
					return;
				}

				// Move the tab into the group
				const moveResult = await window.ipcRenderer.invoke("tab-move", {
					workspaceId: currentWorkspace.id,
					worktreeId: draggedWorktreeId,
					tabId: draggedTabId,
					sourceParentTabId: activeParentTabId,
					targetParentTabId: groupTabId,
					targetIndex: groupTab.tabs?.length || 0,
				});

				if (!moveResult.success) {
					console.error("[MainScreen] Failed to move tab:", moveResult.error);
					return;
				}

				// Update the mosaic tree to include the new tab
				const updatedMosaicTree = addTabToMosaicTree(
					groupTab.mosaicTree,
					draggedTabId,
				);

				await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
					workspaceId: currentWorkspace.id,
					worktreeId: draggedWorktreeId,
					tabId: groupTabId,
					mosaicTree: updatedMosaicTree,
				});

				// Refresh workspace
				const refreshedWorkspace = await window.ipcRenderer.invoke(
					"workspace-get",
					currentWorkspace.id,
				);
				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
				}
				return;
			}

			// Reordering within the same parent group
			if (overData?.type === "tab" && activeParentTabId === overParentTabId) {
				const parentTab = activeParentTabId
					? findTabById(worktree.tabs, activeParentTabId)
					: null;

				const tabsArray = parentTab?.tabs || worktree.tabs;
				const oldIndex = tabsArray.findIndex((t) => t.id === active.id);
				const newIndex = tabsArray.findIndex((t) => t.id === over.id);

				if (oldIndex === -1 || newIndex === -1) return;

				// Save to backend
				const reorderedTabs = arrayMove(tabsArray, oldIndex, newIndex);
				const newOrder = reorderedTabs.map((t) => t.id);
				const result = await window.ipcRenderer.invoke("tab-reorder", {
					workspaceId: currentWorkspace.id,
					worktreeId: draggedWorktreeId,
					parentTabId: activeParentTabId,
					tabIds: newOrder,
				});

				if (!result.success) {
					console.error("[MainScreen] Failed to reorder tabs:", result.error);
				}

				// Refresh workspace
				const refreshedWorkspace = await window.ipcRenderer.invoke(
					"workspace-get",
					currentWorkspace.id,
				);
				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
				}
			}
			// Moving to a different parent group
			else if (
				overData?.type === "tab" &&
				activeParentTabId !== overParentTabId
			) {
				const targetParentTabId = overParentTabId;

				if (targetParentTabId) {
					const draggedTab = findTabById(worktree.tabs, draggedTabId);
					const targetGroupTab = findTabById(worktree.tabs, targetParentTabId);

					if (
						!draggedTab ||
						!targetGroupTab ||
						targetGroupTab.type !== "group"
					) {
						console.error("[MainScreen] Invalid tab or target group");
						return;
					}

					// Move the tab into the group
					const moveResult = await window.ipcRenderer.invoke("tab-move", {
						workspaceId: currentWorkspace.id,
						worktreeId: draggedWorktreeId,
						tabId: draggedTabId,
						sourceParentTabId: activeParentTabId,
						targetParentTabId: targetParentTabId,
						targetIndex: targetGroupTab.tabs?.length || 0,
					});

					if (!moveResult.success) {
						console.error("[MainScreen] Failed to move tab:", moveResult.error);
						return;
					}

					// Update the mosaic tree to include the new tab
					const updatedMosaicTree = addTabToMosaicTree(
						targetGroupTab.mosaicTree,
						draggedTabId,
					);

					await window.ipcRenderer.invoke("tab-update-mosaic-tree", {
						workspaceId: currentWorkspace.id,
						worktreeId: draggedWorktreeId,
						tabId: targetParentTabId,
						mosaicTree: updatedMosaicTree,
					});

					// Refresh workspace
					const refreshedWorkspace = await window.ipcRenderer.invoke(
						"workspace-get",
						currentWorkspace.id,
					);
					if (refreshedWorkspace) {
						setCurrentWorkspace(refreshedWorkspace);
					}
				}
			}
		} catch (error) {
			console.error("[MainScreen] Error during sidebar drag operation:", error);
		}
	};

	// Get active item for drag overlay
	const activeTab =
		activeId && selectedWorktree
			? findTabById(selectedWorktree.tabs, activeId)
			: null;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
			<div className="flex h-screen relative text-neutral-300">
				<Background />

				{/* App Frame - continuous border + sidebar + topbar */}
				<AppFrame>
					{isSidebarOpen && workspaces && (
						<Sidebar
							workspaces={workspaces}
							currentWorkspace={currentWorkspace}
							onTabSelect={handleTabSelect}
							onWorktreeCreated={handleWorktreeCreated}
							onWorkspaceSelect={handleWorkspaceSelect}
							onUpdateWorktree={handleUpdateWorktree}
							selectedTabId={selectedTabId ?? undefined}
							onCollapse={() => setIsSidebarOpen(false)}
							isDragging={!!activeId}
						/>
					)}

					{/* Main Content Area */}
					<div className="flex-1 flex flex-col overflow-hidden">
						{/* Top Bar */}
						{/* <TopBar
						isSidebarOpen={isSidebarOpen}
						onOpenSidebar={() => setIsSidebarOpen(true)}
						workspaceName={currentWorkspace?.name}
						currentBranch={currentWorkspace?.branch}
					/> */}

						{/* Content Area */}
						<DroppableMainContent isOver={isOverMainContent}>
							{loading ||
							error ||
							!currentWorkspace ||
							!selectedTab ||
							!selectedWorktree ? (
								<PlaceholderState
									loading={loading}
									error={error}
									hasWorkspace={!!currentWorkspace}
								/>
							) : parentGroupTab ? (
								// Selected tab is a sub-tab of a group → display the parent group's mosaic
								<TabGroup
									groupTab={parentGroupTab}
									workingDirectory={
										selectedWorktree.path || currentWorkspace.repoPath
									}
									workspaceId={currentWorkspace.id}
									worktreeId={selectedWorktreeId ?? undefined}
									selectedTabId={selectedTabId ?? undefined}
									onTabFocus={handleTabFocus}
								/>
							) : selectedTab.type === "group" ? (
								// Selected tab is a group tab → display its mosaic layout
								<TabGroup
									groupTab={selectedTab}
									workingDirectory={
										selectedWorktree.path || currentWorkspace.repoPath
									}
									workspaceId={currentWorkspace.id}
									worktreeId={selectedWorktreeId ?? undefined}
									selectedTabId={selectedTabId ?? undefined}
									onTabFocus={handleTabFocus}
								/>
							) : (
								// Base level tab (not inside a group) → display full width/height
								<div className="w-full h-full">
									<TabContent
										tab={selectedTab}
										workingDirectory={
											selectedWorktree.path || currentWorkspace.repoPath
										}
										workspaceId={currentWorkspace.id}
										worktreeId={selectedWorktreeId ?? undefined}
										worktree={selectedWorktree}
										groupTabId="" // No parent group
										selectedTabId={selectedTabId ?? undefined}
										onTabFocus={handleTabFocus}
									/>
								</div>
							)}
						</DroppableMainContent>
					</div>
				</AppFrame>
			</div>

			{/* Drag Overlay - follows the cursor */}
			<DragOverlay>
				{activeTab ? (
					<div className="bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm opacity-90 cursor-grabbing">
						{activeTab.name}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
