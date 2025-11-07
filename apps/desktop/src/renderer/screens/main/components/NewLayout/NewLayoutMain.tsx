import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import type { Tab, Workspace, Worktree } from "shared/types";
import { AppFrame } from "../AppFrame";
import { Background } from "../Background";
import TabContent from "../MainContent/TabContent";
import TabGroup from "../MainContent/TabGroup";
import { PlaceholderState } from "../PlaceholderState";
import { Sidebar } from "../Sidebar";
import { DiffTab } from "../TabContent/components/DiffTab";
import { WorkspaceTabs } from "./WorkspaceTabs";

export const NewLayoutMain: React.FC = () => {
	const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [showSidebarOverlay, setShowSidebarOverlay] = useState(false);

	// Workspace state
	const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
	const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
		null,
	);
	const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(
		null,
	);
	const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const handleCollapseSidebar = () => {
		const panel = sidebarPanelRef.current;
		if (panel && !panel.isCollapsed()) {
			panel.collapse();
			setIsSidebarOpen(false);
		}
	};

	const handleExpandSidebar = () => {
		const panel = sidebarPanelRef.current;
		if (panel && panel.isCollapsed()) {
			panel.expand();
			setIsSidebarOpen(true);
		}
	};

	// Get selected worktree
	const selectedWorktree = currentWorkspace?.worktrees?.find(
		(wt) => wt.id === selectedWorktreeId,
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

	// Load all workspaces
	const loadAllWorkspaces = async () => {
		try {
			const allWorkspaces = await window.ipcRenderer.invoke("workspace-list");
			setWorkspaces(allWorkspaces);
		} catch (error) {
			console.error("Failed to load workspaces:", error);
		}
	};

	// Handle tab selection
	const handleTabSelect = (worktreeId: string, tabId: string) => {
		setSelectedWorktreeId(worktreeId);
		setSelectedTabId(tabId);

		if (currentWorkspace) {
			window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId,
				tabId,
			});

			setCurrentWorkspace({
				...currentWorkspace,
				activeWorktreeId: worktreeId,
				activeTabId: tabId,
			});
		}
	};

	// Handle tab focus (for terminals)
	const handleTabFocus = (tabId: string) => {
		if (!currentWorkspace || !selectedWorktreeId) return;

		setSelectedTabId(tabId);

		window.ipcRenderer.invoke("workspace-set-active-selection", {
			workspaceId: currentWorkspace.id,
			worktreeId: selectedWorktreeId,
			tabId,
		});

		setCurrentWorkspace({
			...currentWorkspace,
			activeWorktreeId: selectedWorktreeId,
			activeTabId: tabId,
		});
	};

	// Handle workspace selection
	const handleWorkspaceSelect = async (workspaceId: string) => {
		try {
			const workspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			);

			if (workspace) {
				setCurrentWorkspace(workspace);
				await window.ipcRenderer.invoke(
					"workspace-set-active-workspace-id",
					workspaceId,
				);

				const activeSelection = await window.ipcRenderer.invoke(
					"workspace-get-active-selection",
					workspaceId,
				);

				if (activeSelection?.worktreeId && activeSelection?.tabId) {
					setSelectedWorktreeId(activeSelection.worktreeId);
					setSelectedTabId(activeSelection.tabId);
				} else {
					setSelectedWorktreeId(null);
					setSelectedTabId(null);
				}
			}
		} catch (error) {
			console.error("Failed to load workspace:", error);
		}
	};

	// Handle worktree created
	const handleWorktreeCreated = async () => {
		if (!currentWorkspace) return;

		try {
			const refreshedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			);

			if (refreshedWorkspace) {
				setCurrentWorkspace(refreshedWorkspace);
				await loadAllWorkspaces();
			}
		} catch (error) {
			console.error("Failed to refresh workspace:", error);
		}
	};

	// Handle worktree update
	const handleUpdateWorktree = (
		worktreeId: string,
		updatedWorktree: Worktree,
	) => {
		if (!currentWorkspace) return;

		const updatedWorktrees = currentWorkspace.worktrees.map((wt) =>
			wt.id === worktreeId ? updatedWorktree : wt,
		);

		const updatedCurrentWorkspace = {
			...currentWorkspace,
			worktrees: updatedWorktrees,
		};

		setCurrentWorkspace(updatedCurrentWorkspace);

		if (workspaces) {
			setWorkspaces(
				workspaces.map((ws) =>
					ws.id === currentWorkspace.id ? updatedCurrentWorkspace : ws,
				),
			);
		}
	};

	// Handle show diff - creates a diff tab
	const handleShowDiff = async (worktreeId: string) => {
		if (!currentWorkspace) return;

		// Find the worktree
		const worktree = currentWorkspace.worktrees?.find(
			(wt) => wt.id === worktreeId,
		);
		if (!worktree) return;

		// Check if a diff tab already exists for this worktree
		const existingDiffTab = worktree.tabs?.find((tab) => tab.type === "diff");

		if (existingDiffTab) {
			// If a diff tab already exists, just select it
			await window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId: worktreeId,
				tabId: existingDiffTab.id,
			});

			// Reload the workspace to get the updated state
			const updatedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			);
			if (updatedWorkspace) {
				setCurrentWorkspace(updatedWorkspace);
			}

			// Update the workspaces array
			await loadAllWorkspaces();

			// Set state to select the tab
			setSelectedWorktreeId(worktreeId);
			setSelectedTabId(existingDiffTab.id);
			return;
		}

		// Create a new diff tab
		const result = await window.ipcRenderer.invoke("tab-create", {
			workspaceId: currentWorkspace.id,
			worktreeId: worktreeId,
			name: `Changes – ${worktree.branch}`,
			type: "diff",
		});

		if (result.success && result.tab) {
			// Set active selection in backend first
			await window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId: worktreeId,
				tabId: result.tab.id,
			});

			// Reload the workspace to get the updated state with the new tab
			const updatedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			);
			if (updatedWorkspace) {
				setCurrentWorkspace(updatedWorkspace);
			}

			// Update the workspaces array
			await loadAllWorkspaces();

			// Set state to select the new tab
			setSelectedWorktreeId(worktreeId);
			setSelectedTabId(result.tab.id);
		}
	};

	// Load active workspace on mount
	useEffect(() => {
		const loadActiveWorkspace = async () => {
			try {
				setLoading(true);
				setError(null);

				await loadAllWorkspaces();

				let workspaceId = await window.ipcRenderer.invoke(
					"workspace-get-active-workspace-id",
				);

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

	// Listen for workspace-opened event
	useEffect(() => {
		const handler = async (workspace: Workspace) => {
			console.log(
				"[NewLayoutMain] Workspace opened event received:",
				workspace,
			);
			setLoading(false);

			await window.ipcRenderer.invoke(
				"workspace-set-active-workspace-id",
				workspace.id,
			);
			await loadAllWorkspaces();

			const refreshedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspace.id,
			);
			if (refreshedWorkspace) {
				setCurrentWorkspace(refreshedWorkspace);
			}
		};

		window.ipcRenderer.on("workspace-opened", handler);
		return () => {
			window.ipcRenderer.off("workspace-opened", handler);
		};
	}, []);

	return (
		<>
			<Background />

			{/* Hover trigger area when sidebar is hidden */}
			{!isSidebarOpen && (
				<div
					className="fixed left-0 top-0 bottom-0 w-2 z-50"
					onMouseEnter={() => setShowSidebarOverlay(true)}
				/>
			)}

			{/* Sidebar overlay when hidden and hovering */}
			{!isSidebarOpen && showSidebarOverlay && workspaces && (
				<div
					className="fixed left-0 top-0 bottom-0 w-80 z-40 animate-in slide-in-from-left duration-200"
					onMouseLeave={() => setShowSidebarOverlay(false)}
				>
					<div className="h-full border-r border-neutral-800 bg-neutral-950/95 backdrop-blur-sm">
						<Sidebar
							workspaces={workspaces}
							currentWorkspace={currentWorkspace}
							onTabSelect={handleTabSelect}
							onWorktreeCreated={handleWorktreeCreated}
							onWorkspaceSelect={handleWorkspaceSelect}
							onUpdateWorktree={handleUpdateWorktree}
							selectedTabId={selectedTabId ?? undefined}
							onCollapse={() => {
								setShowSidebarOverlay(false);
							}}
							onShowDiff={handleShowDiff}
						/>
					</div>
				</div>
			)}

			<AppFrame>
				<div className="flex flex-col h-full w-full">
					{/* Workspace tabs at the top */}
					<WorkspaceTabs
						onCollapseSidebar={handleCollapseSidebar}
						onExpandSidebar={handleExpandSidebar}
						isSidebarOpen={isSidebarOpen}
					/>

					{/* Main content area with resizable sidebar */}
					<div className="flex-1 overflow-hidden border-t border-neutral-700">
						<ResizablePanelGroup
							direction="horizontal"
							autoSaveId="new-layout-panels"
						>
							{/* Sidebar panel with full workspace/worktree management */}
							<ResizablePanel
								ref={sidebarPanelRef}
								defaultSize={20}
								minSize={15}
								maxSize={40}
								collapsible
								onCollapse={() => setIsSidebarOpen(false)}
								onExpand={() => setIsSidebarOpen(true)}
							>
								{isSidebarOpen && workspaces && (
									<Sidebar
										workspaces={workspaces}
										currentWorkspace={currentWorkspace}
										onTabSelect={handleTabSelect}
										onWorktreeCreated={handleWorktreeCreated}
										onWorkspaceSelect={handleWorkspaceSelect}
										onUpdateWorktree={handleUpdateWorktree}
										selectedTabId={selectedTabId ?? undefined}
										onCollapse={() => {
											const panel = sidebarPanelRef.current;
											if (panel && !panel.isCollapsed()) {
												panel.collapse();
											}
										}}
										onShowDiff={handleShowDiff}
									/>
								)}
							</ResizablePanel>

							<ResizableHandle withHandle />

							{/* Main content panel */}
							<ResizablePanel defaultSize={80} minSize={30}>
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
										key={`${parentGroupTab.id}-${JSON.stringify(parentGroupTab.mosaicTree)}-${parentGroupTab.tabs?.length}`}
										groupTab={parentGroupTab}
										workingDirectory={
											selectedWorktree.path || currentWorkspace.repoPath
										}
										workspaceId={currentWorkspace.id}
										worktreeId={selectedWorktreeId ?? undefined}
										selectedTabId={selectedTabId ?? undefined}
										onTabFocus={handleTabFocus}
										workspaceName={currentWorkspace.name}
										mainBranch={currentWorkspace.branch}
									/>
								) : selectedTab.type === "group" ? (
									// Selected tab is a group tab → display its mosaic layout
									<TabGroup
										key={`${selectedTab.id}-${JSON.stringify(selectedTab.mosaicTree)}-${selectedTab.tabs?.length}`}
										groupTab={selectedTab}
										workingDirectory={
											selectedWorktree.path || currentWorkspace.repoPath
										}
										workspaceId={currentWorkspace.id}
										worktreeId={selectedWorktreeId ?? undefined}
										selectedTabId={selectedTabId ?? undefined}
										onTabFocus={handleTabFocus}
										workspaceName={currentWorkspace.name}
										mainBranch={currentWorkspace.branch}
									/>
								) : selectedTab.type === "diff" ? (
									// Diff tab → display diff view
									<div className="w-full h-full">
										<DiffTab
											tab={selectedTab}
											workspaceId={currentWorkspace.id}
											worktreeId={selectedWorktreeId ?? ""}
											worktree={selectedWorktree}
											workspaceName={currentWorkspace.name}
											mainBranch={currentWorkspace.branch}
										/>
									</div>
								) : (
									// Base level tab (terminal, preview, etc.) → display full width/height
									<div className="w-full h-full p-2 bg-[#1e1e1e]">
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
											workspaceName={currentWorkspace.name}
											mainBranch={currentWorkspace.branch}
										/>
									</div>
								)}
							</ResizablePanel>
						</ResizablePanelGroup>
					</div>
				</div>
			</AppFrame>
		</>
	);
};
