import type {
	CreateTabInput,
	CreateWorkspaceInput,
	CreateWorktreeInput,
	MosaicNode,
	Tab,
	UpdateWorkspaceInput,
	Workspace,
	Worktree,
} from "shared/types";

import * as tabOps from "./workspace/tab-operations";
import * as workspaceOps from "./workspace/workspace-operations";
import * as worktreeOps from "./workspace/worktree-operations";

/**
 * Main WorkspaceManager class that coordinates all workspace operations
 * This is a singleton that delegates to specialized operation modules
 */
class WorkspaceManager {
	private static instance: WorkspaceManager;

	private constructor() {}

	static getInstance(): WorkspaceManager {
		if (!WorkspaceManager.instance) {
			WorkspaceManager.instance = new WorkspaceManager();
		}
		return WorkspaceManager.instance;
	}

	// ============================================================================
	// Workspace Operations
	// ============================================================================

	/**
	 * Get all workspaces
	 */
	async list(): Promise<Workspace[]> {
		return workspaceOps.listWorkspaces();
	}

	/**
	 * Get a workspace by ID
	 */
	async get(id: string): Promise<Workspace | null> {
		return workspaceOps.getWorkspace(id);
	}

	/**
	 * Create a new workspace
	 */
	async create(
		input: CreateWorkspaceInput,
	): Promise<{ success: boolean; workspace?: Workspace; error?: string }> {
		return workspaceOps.createWorkspace(input);
	}

	/**
	 * Get the last opened workspace
	 */
	async getLastOpened(): Promise<Workspace | null> {
		return workspaceOps.getLastOpenedWorkspace();
	}

	/**
	 * Update a workspace
	 */
	async update(
		input: UpdateWorkspaceInput,
	): Promise<{ success: boolean; workspace?: Workspace; error?: string }> {
		return workspaceOps.updateWorkspace(input);
	}

	/**
	 * Delete a workspace
	 */
	async delete(
		id: string,
		removeWorktree = false,
	): Promise<{ success: boolean; error?: string }> {
		return workspaceOps.deleteWorkspace(id, removeWorktree);
	}

	/**
	 * Get active selection for a workspace
	 */
	async getActiveSelection(workspaceId: string): Promise<{
		worktreeId: string | null;
		tabId: string | null;
	} | null> {
		return workspaceOps.getActiveSelection(workspaceId);
	}

	/**
	 * Set active selection for a workspace
	 */
	async setActiveSelection(
		workspaceId: string,
		worktreeId: string | null,
		tabId: string | null,
	): Promise<boolean> {
		return workspaceOps.setActiveSelection(workspaceId, worktreeId, tabId);
	}

	/**
	 * Get active workspace ID
	 */
	async getActiveWorkspaceId(): Promise<string | null> {
		return workspaceOps.getActiveWorkspaceId();
	}

	/**
	 * Set active workspace ID
	 */
	async setActiveWorkspaceId(workspaceId: string): Promise<boolean> {
		return workspaceOps.setActiveWorkspaceId(workspaceId);
	}

	// ============================================================================
	// Worktree Operations
	// ============================================================================

	/**
	 * Create a new worktree
	 */
	async createWorktree(
		input: CreateWorktreeInput,
		webContents?: Electron.WebContents,
	): Promise<{ success: boolean; worktree?: Worktree; error?: string }> {
		const workspace = await this.get(input.workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}
		return worktreeOps.createWorktree(workspace, input, webContents);
	}

	/**
	 * Remove a worktree
	 */
	async removeWorktree(
		workspaceId: string,
		worktreeId: string,
	): Promise<{ success: boolean; error?: string }> {
		const workspace = await this.get(workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}
		return worktreeOps.removeWorktree(workspace, worktreeId);
	}

	/**
	 * Check if a worktree can be merged
	 */
	async canMergeWorktree(
		workspaceId: string,
		worktreeId: string,
	): Promise<{
		success: boolean;
		canMerge?: boolean;
		reason?: string;
		error?: string;
		isActiveWorktree?: boolean;
		hasUncommittedChanges?: boolean;
	}> {
		const workspace = await this.get(workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}
		return worktreeOps.canMergeWorktree(workspace, worktreeId);
	}

	/**
	 * Merge a worktree into the active worktree
	 */
	async mergeWorktree(
		workspaceId: string,
		worktreeId: string,
	): Promise<{ success: boolean; error?: string }> {
		const workspace = await this.get(workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}
		return worktreeOps.mergeWorktree(workspace, worktreeId);
	}

	/**
	 * Get the path of a worktree
	 */
	async getWorktreePath(
		workspaceId: string,
		worktreeId: string,
	): Promise<string | null> {
		const workspace = await this.get(workspaceId);
		if (!workspace) return null;
		return worktreeOps.getWorktreePath(workspace, worktreeId);
	}

	/**
	 * Scan and import existing git worktrees
	 */
	async scanAndImportWorktrees(
		workspaceId: string,
	): Promise<{ success: boolean; imported?: number; error?: string }> {
		const workspace = await this.get(workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}
		return worktreeOps.scanAndImportWorktrees(workspace);
	}

	// ============================================================================
	// Tab Operations
	// ============================================================================

	/**
	 * Create a new tab
	 */
	async createTab(
		input: CreateTabInput,
	): Promise<{ success: boolean; tab?: Tab; error?: string }> {
		const workspace = await this.get(input.workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}
		return tabOps.createTab(workspace, input);
	}

	/**
	 * Delete a tab
	 */
	async deleteTab(input: {
		workspaceId: string;
		worktreeId: string;
		tabId: string;
	}): Promise<{ success: boolean; error?: string }> {
		const workspace = await this.get(input.workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}
		return tabOps.deleteTab(workspace, input);
	}

	/**
	 * Reorder tabs
	 */
	async reorderTabs(
		workspaceId: string,
		worktreeId: string,
		parentTabId: string | undefined,
		tabIds: string[],
	): Promise<{ success: boolean; error?: string }> {
		const workspace = await this.get(workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}
		return tabOps.reorderTabs(workspace, {
			worktreeId,
			parentTabId,
			tabIds,
		});
	}

	/**
	 * Move a tab between parents
	 */
	async moveTab(
		workspaceId: string,
		worktreeId: string,
		tabId: string,
		sourceParentTabId: string | undefined,
		targetParentTabId: string | undefined,
		targetIndex: number,
	): Promise<{ success: boolean; error?: string }> {
		const workspace = await this.get(workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}
		return tabOps.moveTab(workspace, {
			worktreeId,
			tabId,
			sourceParentTabId,
			targetParentTabId,
			targetIndex,
		});
	}

	/**
	 * Update mosaic tree for a group tab
	 */
	async updateTabMosaicTree(
		workspaceId: string,
		worktreeId: string,
		tabId: string,
		mosaicTree: MosaicNode<string> | null | undefined,
	): Promise<{ success: boolean; error?: string }> {
		const workspace = await this.get(workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}
		return tabOps.updateTabMosaicTree(workspace, {
			worktreeId,
			tabId,
			mosaicTree,
		});
	}

	/**
	 * Update terminal CWD
	 */
	updateTerminalCwd(
		workspaceId: string,
		worktreeId: string,
		tabId: string,
		cwd: string,
	): Promise<boolean> {
		return this.get(workspaceId).then((workspace) => {
			if (!workspace) return false;
			return tabOps.updateTerminalCwd(workspace, {
				worktreeId,
				tabId,
				cwd,
			});
		});
	}
}

export default WorkspaceManager.getInstance();
