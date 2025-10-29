import { useEffect, useState } from "react";

import ScreenLayout from "renderer/components/ScreenLayout";
import type { Workspace } from "shared/types";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { PlaceholderState } from "./components/PlaceholderState";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

export function MainScreen() {
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
	const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
		null,
	);
	const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(
		null,
	);
	const [selectedTabGroupId, setSelectedTabGroupId] = useState<string | null>(
		null,
	);
	const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Get selected tab group details (contains all tabs in the grid)
	const selectedTabGroup = currentWorkspace?.worktrees
		?.find((wt) => wt.id === selectedWorktreeId)
		?.tabGroups.find((tg) => tg.id === selectedTabGroupId);

	const selectedWorktree = currentWorkspace?.worktrees?.find(
		(wt) => wt.id === selectedWorktreeId,
	);

	const handleTabSelect = (
		worktreeId: string,
		tabGroupId: string,
		tabId: string,
	) => {
		setSelectedWorktreeId(worktreeId);
		setSelectedTabGroupId(tabGroupId);
		setSelectedTabId(tabId);
		// Save active selection
		if (currentWorkspace) {
			window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId,
				tabGroupId,
				tabId,
			});
		}
	};

	const handleTabGroupSelect = (worktreeId: string, tabGroupId: string) => {
		setSelectedWorktreeId(worktreeId);
		setSelectedTabGroupId(tabGroupId);
		// Clear individual tab selection when selecting a tab group
		setSelectedTabId(null);
		// Save active selection
		if (currentWorkspace) {
			window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId,
				tabGroupId,
				tabId: null,
			});
		}
	};

	const handleTabFocus = (tabId: string) => {
		// When a terminal gets focus, find its worktree and tab group
		if (!currentWorkspace || !selectedWorktreeId || !selectedTabGroupId) return;

		setSelectedTabId(tabId);
		// Save active selection
		window.ipcRenderer.invoke("workspace-set-active-selection", {
			workspaceId: currentWorkspace.id,
			worktreeId: selectedWorktreeId,
			tabGroupId: selectedTabGroupId,
			tabId,
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

				if (activeSelection?.worktreeId && activeSelection?.tabGroupId) {
					setSelectedWorktreeId(activeSelection.worktreeId);
					setSelectedTabGroupId(activeSelection.tabGroupId);
					setSelectedTabId(activeSelection.tabId);
				} else {
					// No saved selection, reset
					setSelectedWorktreeId(null);
					setSelectedTabGroupId(null);
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

			if (result.success && result.data?.imported && result.data.imported > 0) {
				console.log("[MainScreen] Imported worktrees:", result.data.imported);
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

						if (activeSelection?.worktreeId && activeSelection?.tabGroupId) {
							setSelectedWorktreeId(activeSelection.worktreeId);
							setSelectedTabGroupId(activeSelection.tabGroupId);
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

	return (
		<div className="flex h-screen relative text-neutral-300">
			<Background />

			{/* App Frame - continuous border + sidebar + topbar */}
			<AppFrame>
				{isSidebarOpen && workspaces && (
					<Sidebar
						workspaces={workspaces}
						currentWorkspace={currentWorkspace}
						onTabSelect={handleTabSelect}
						onTabGroupSelect={handleTabGroupSelect}
						onWorktreeCreated={handleWorktreeCreated}
						onWorkspaceSelect={handleWorkspaceSelect}
					onUpdateWorktree={handleUpdateWorktree}
						selectedTabId={selectedTabId ?? undefined}
						selectedTabGroupId={selectedTabGroupId ?? undefined}
						onCollapse={() => setIsSidebarOpen(false)}
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

					{/* Content Area - Terminal Layout */}
					<div className="flex-1 overflow-hidden">
						{loading ||
						error ||
						!currentWorkspace ||
						!selectedTabGroup ||
						!selectedWorktree ? (
							<PlaceholderState
								loading={loading}
								error={error}
								hasWorkspace={!!currentWorkspace}
							/>
						) : (
							<ScreenLayout
								tabGroup={selectedTabGroup}
								workingDirectory={
									selectedWorktree.path || currentWorkspace.repoPath
								}
								workspaceId={currentWorkspace.id}
								worktreeId={selectedWorktreeId ?? undefined}
								selectedTabId={selectedTabId ?? undefined}
								onTabFocus={handleTabFocus}
							/>
						)}
					</div>
				</div>
			</AppFrame>
		</div>
	);
}
