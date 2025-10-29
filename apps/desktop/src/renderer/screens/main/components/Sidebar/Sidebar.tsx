import { type MotionValue, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import type { Worktree, Workspace } from "shared/types";
import {
	CreateWorktreeButton,
	CreateWorktreeModal,
	SidebarHeader,
	WorkspaceCarousel,
	WorkspaceSwitcher,
	WorktreeList,
} from "./components";

interface SidebarProps {
	workspaces: Workspace[];
	currentWorkspace: Workspace | null;
	onCollapse: () => void;
	onTabSelect: (worktreeId: string, tabGroupId: string, tabId: string) => void;
	onTabGroupSelect: (worktreeId: string, tabGroupId: string) => void;
	onWorktreeCreated: () => void;
	onWorkspaceSelect: (workspaceId: string) => void;
	onUpdateWorktree: (worktreeId: string, updatedWorktree: Worktree) => void;
	selectedTabId: string | undefined;
	selectedTabGroupId: string | undefined;
}

export function Sidebar({
	workspaces,
	currentWorkspace,
	onCollapse,
	onTabSelect,
	onTabGroupSelect,
	onWorktreeCreated,
	onWorkspaceSelect,
	onUpdateWorktree,
	selectedTabId,
	selectedTabGroupId,
}: SidebarProps) {
	const [expandedWorktrees, setExpandedWorktrees] = useState<Set<string>>(
		new Set(),
	);
	const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
	const [isScanningWorktrees, setIsScanningWorktrees] = useState(false);
	const [showWorktreeModal, setShowWorktreeModal] = useState(false);
	const [branchName, setBranchName] = useState("");

	// Initialize with current workspace index
	const currentIndex = workspaces.findIndex(
		(w) => w.id === currentWorkspace?.id,
	);
	const initialIndex = currentIndex >= 0 ? currentIndex : 0;
	const defaultScrollProgress = useMotionValue(initialIndex);
	const [scrollProgress, setScrollProgress] = useState<MotionValue<number>>(
		defaultScrollProgress,
	);

	console.log(currentWorkspace, workspaces);

	// Auto-expand worktree if it contains the selected tab group
	useEffect(() => {
		if (currentWorkspace && selectedTabGroupId) {
			// Find which worktree contains the selected tab group
			const worktreeWithSelectedTabGroup = currentWorkspace.worktrees?.find(
				(worktree) =>
					worktree.tabGroups?.some((tg) => tg.id === selectedTabGroupId),
			);

			if (worktreeWithSelectedTabGroup) {
				setExpandedWorktrees((prev) => {
					const next = new Set(prev);
					next.add(worktreeWithSelectedTabGroup.id);
					return next;
				});
			}
		}
	}, [currentWorkspace, selectedTabGroupId]);

	const toggleWorktree = (worktreeId: string) => {
		setExpandedWorktrees((prev) => {
			const next = new Set(prev);
			if (next.has(worktreeId)) {
				next.delete(worktreeId);
			} else {
				next.add(worktreeId);
			}
			return next;
		});
	};

	const handleCreateWorktree = () => {
		console.log("[Sidebar] New Worktree button clicked");
		setShowWorktreeModal(true);
	};

	const handleSubmitWorktree = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!currentWorkspace || !branchName.trim()) return;

		console.log("[Sidebar] Creating worktree:", {
			branchName,
			createBranch: true,
		});
		setIsCreatingWorktree(true);

		try {
			// Type-safe IPC call - no need for type assertion!
			const result = await window.ipcRenderer.invoke("worktree-create", {
				workspaceId: currentWorkspace.id,
				branch: branchName.trim(),
				createBranch: true,
			});

			if (result.success) {
				console.log("[Sidebar] Worktree created successfully");
				setShowWorktreeModal(false);
				setBranchName("");
				onWorktreeCreated();
			} else {
				console.error("[Sidebar] Failed to create worktree:", result.error);
				alert(`Failed to create worktree: ${result.error || "Unknown error"}`);
			}
		} catch (error) {
			console.error("[Sidebar] Error creating worktree:", error);
			alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			setIsCreatingWorktree(false);
		}
	};

	const handleCancelWorktree = () => {
		setShowWorktreeModal(false);
		setBranchName("");
	};

	const handleAddWorkspace = () => {
		// Trigger the File -> Open Repository menu action
		window.ipcRenderer.send("open-repository");
	};

	const handleRemoveWorkspace = async (
		workspaceId: string,
		workspaceName: string,
	) => {
		// Confirm deletion
		const confirmed = window.confirm(
			`Remove workspace "${workspaceName}"?\n\nAll terminal sessions for this workspace will be closed.`,
		);

		if (!confirmed) return;

		try {
			const result = await window.ipcRenderer.invoke("workspace-delete", {
				id: workspaceId,
				removeWorktree: false,
			});
			if (result.success) {
				// If we deleted the current workspace, clear selection
				if (currentWorkspace?.id === workspaceId) {
					onWorkspaceSelect("");
				}
				// Refresh will happen via workspace-opened event
				window.location.reload();
			} else {
				alert(`Failed to remove workspace: ${result.error || "Unknown error"}`);
			}
		} catch (error) {
			console.error("Error removing workspace:", error);
			alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const handleScanWorktrees = async () => {
		if (!currentWorkspace) return;

		console.log(
			"[Sidebar] Scanning worktrees for workspace:",
			currentWorkspace.id,
		);
		setIsScanningWorktrees(true);

		try {
			const result = (await window.ipcRenderer.invoke(
				"workspace-scan-worktrees",
				currentWorkspace.id,
			)) as { success: boolean; imported?: number; error?: string };

			if (result.success) {
				console.log("[Sidebar] Scan completed, imported:", result.imported);
				if (result.imported && result.imported > 0) {
					onWorktreeCreated();
				}
			} else {
				console.error("[Sidebar] Failed to scan worktrees:", result.error);
			}
		} catch (error) {
			console.error("[Sidebar] Error scanning worktrees:", error);
		} finally {
			setIsScanningWorktrees(false);
		}
	};

	return (
		<div className="flex flex-col h-full w-64 select-none text-neutral-300">
			<SidebarHeader
				onCollapse={onCollapse}
				onScanWorktrees={handleScanWorktrees}
				isScanningWorktrees={isScanningWorktrees}
				hasWorkspace={!!currentWorkspace}
			/>

			<WorkspaceCarousel
				workspaces={workspaces}
				currentWorkspace={currentWorkspace}
				onWorkspaceSelect={onWorkspaceSelect}
				onScrollProgress={setScrollProgress}
			>
				{(workspace, isActive) => (
					<>
						<WorktreeList
							currentWorkspace={workspace}
							expandedWorktrees={expandedWorktrees}
							onToggleWorktree={toggleWorktree}
							onTabSelect={onTabSelect}
							onTabGroupSelect={onTabGroupSelect}
							onReload={onWorktreeCreated}
							onUpdateWorktree={onUpdateWorktree}
							selectedTabId={selectedTabId}
							selectedTabGroupId={selectedTabGroupId}
						/>

						{workspace && (
							<CreateWorktreeButton
								onClick={handleCreateWorktree}
								isCreating={isCreatingWorktree}
							/>
						)}
					</>
				)}
			</WorkspaceCarousel>

			<WorkspaceSwitcher
				workspaces={workspaces}
				currentWorkspaceId={currentWorkspace?.id || null}
				onWorkspaceSelect={onWorkspaceSelect}
				onAddWorkspace={handleAddWorkspace}
				onRemoveWorkspace={handleRemoveWorkspace}
				scrollProgress={scrollProgress}
			/>

			<CreateWorktreeModal
				isOpen={showWorktreeModal}
				onClose={handleCancelWorktree}
				onSubmit={handleSubmitWorktree}
				isCreating={isCreatingWorktree}
				branchName={branchName}
				onBranchNameChange={setBranchName}
			/>
		</div>
	);
}
