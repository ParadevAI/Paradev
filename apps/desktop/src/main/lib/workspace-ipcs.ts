import { BrowserWindow, dialog, ipcMain } from "electron";

import type {
	CreateTabGroupInput,
	CreateTabInput,
	CreateWorkspaceInput,
	CreateWorktreeInput,
	UpdateWorkspaceInput,
} from "shared/types";

import configManager from "./config-manager";
import workspaceManager from "./workspace-manager";

export function registerWorkspaceIPCs() {
	// Open repository dialog
	ipcMain.on("open-repository", async (event) => {
		const mainWindow = BrowserWindow.fromWebContents(event.sender);
		if (!mainWindow) return;

		// Show directory picker
		const result = await dialog.showOpenDialog(mainWindow, {
			properties: ["openDirectory"],
			title: "Select Repository",
		});

		if (result.canceled || result.filePaths.length === 0) {
			return;
		}

		const repoPath = result.filePaths[0];

		// Get current branch
		const worktreeManager = (await import("./worktree-manager")).default;
		if (!worktreeManager.isGitRepo(repoPath)) {
			dialog.showErrorBox(
				"Not a Git Repository",
				"The selected directory is not a git repository.",
			);
			return;
		}

		const currentBranch = worktreeManager.getCurrentBranch(repoPath);
		if (!currentBranch) {
			dialog.showErrorBox("Error", "Could not determine current branch.");
			return;
		}

		// Check if workspace already exists for this repo
		const existingWorkspaces = await workspaceManager.list();
		const existingWorkspace = existingWorkspaces.find(
			(ws) => ws.repoPath === repoPath,
		);

		if (existingWorkspace) {
			// Workspace already exists, just switch to it
			mainWindow.webContents.send("workspace-opened", existingWorkspace);
			return;
		}

		// Create workspace with repo name and current branch
		const repoName = repoPath.split("/").pop() || "Repository";

		const createResult = await workspaceManager.create({
			name: repoName,
			repoPath,
			branch: currentBranch,
		});

		if (!createResult.success) {
			dialog.showErrorBox(
				"Error",
				createResult.error || "Failed to open repository",
			);
			return;
		}

		// Notify renderer to reload workspaces
		mainWindow.webContents.send("workspace-opened", createResult.workspace);
	});

	// List all workspaces
	ipcMain.handle("workspace-list", async () => {
		return await workspaceManager.list();
	});

	// Get workspace by ID
	ipcMain.handle("workspace-get", async (_event, id: string) => {
		return await workspaceManager.get(id);
	});

	// Create workspace
	ipcMain.handle(
		"workspace-create",
		async (_event, input: CreateWorkspaceInput) => {
			return await workspaceManager.create(input);
		},
	);

	// Update workspace
	ipcMain.handle(
		"workspace-update",
		async (_event, input: UpdateWorkspaceInput) => {
			return await workspaceManager.update(input);
		},
	);

	// Delete workspace
	ipcMain.handle(
		"workspace-delete",
		async (_event, input: { id: string; removeWorktree?: boolean }) => {
			return await workspaceManager.delete(
				input.id,
				input.removeWorktree ?? false,
			);
		},
	);

	// Get last opened workspace
	ipcMain.handle("workspace-get-last-opened", async () => {
		return await workspaceManager.getLastOpened();
	});

	// Create worktree
	ipcMain.handle(
		"worktree-create",
		async (_event, input: CreateWorktreeInput) => {
			return await workspaceManager.createWorktree(input);
		},
	);

	// Create tab group
	ipcMain.handle(
		"tab-group-create",
		async (_event, input: CreateTabGroupInput) => {
			return await workspaceManager.createTabGroup(input);
		},
	);

	// Create tab
	ipcMain.handle("tab-create", async (_event, input: CreateTabInput) => {
		return await workspaceManager.createTab(input);
	});

	// Delete tab
	ipcMain.handle(
		"tab-delete",
		async (
			_event,
			input: { workspaceId: string; worktreeId: string; tabId: string },
		) => {
			return await workspaceManager.deleteTab(input);
		},
	);

	// Scan and import existing worktrees
	ipcMain.handle(
		"workspace-scan-worktrees",
		async (_event, workspaceId: string) => {
			return await workspaceManager.scanAndImportWorktrees(workspaceId);
		},
	);

	// Get active selection
	ipcMain.handle(
		"workspace-get-active-selection",
		async (_event, workspaceId: string) => {
			return configManager.getActiveSelection(workspaceId);
		},
	);

	// Set active selection
	ipcMain.handle(
		"workspace-set-active-selection",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string | null;
				tabGroupId: string | null;
				tabId: string | null;
			},
		) => {
			return configManager.setActiveSelection(
				input.workspaceId,
				input.worktreeId,
				input.tabGroupId,
				input.tabId,
			);
		},
	);

	// Get active workspace ID
	ipcMain.handle("workspace-get-active-workspace-id", async () => {
		return configManager.getActiveWorkspaceId();
	});

	// Set active workspace ID
	ipcMain.handle(
		"workspace-set-active-workspace-id",
		async (_event, workspaceId: string) => {
			return configManager.setActiveWorkspaceId(workspaceId);
		},
	);

	// Reorder tabs within a tab group
	ipcMain.handle(
		"tab-reorder",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				tabGroupId: string;
				tabIds: string[];
			},
		) => {
			return await workspaceManager.reorderTabs(
				input.workspaceId,
				input.worktreeId,
				input.tabGroupId,
				input.tabIds,
			);
		},
	);

	// Reorder tab groups within a worktree
	ipcMain.handle(
		"tab-group-reorder",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				tabGroupIds: string[];
			},
		) => {
			return await workspaceManager.reorderTabGroups(
				input.workspaceId,
				input.worktreeId,
				input.tabGroupIds,
			);
		},
	);

	// Update tab group grid sizes
	ipcMain.handle(
		"tab-group-update-grid-sizes",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				tabGroupId: string;
				rowSizes?: number[];
				colSizes?: number[];
			},
		) => {
			return await workspaceManager.updateTabGroupGridSizes(
				input.workspaceId,
				input.worktreeId,
				input.tabGroupId,
				input.rowSizes,
				input.colSizes,
			);
		},
	);

	// Move tab to another tab group
	ipcMain.handle(
		"tab-move-to-group",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				tabId: string;
				sourceTabGroupId: string;
				targetTabGroupId: string;
				targetIndex: number;
			},
		) => {
			return await workspaceManager.moveTabToGroup(
				input.workspaceId,
				input.worktreeId,
				input.tabId,
				input.sourceTabGroupId,
				input.targetTabGroupId,
				input.targetIndex,
			);
		},
	);

	// Update terminal CWD in workspace config
	ipcMain.handle(
		"workspace-update-terminal-cwd",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				tabGroupId: string;
				tabId: string;
				cwd: string;
			},
		) => {
			return workspaceManager.updateTerminalCwd(
				input.workspaceId,
				input.worktreeId,
				input.tabGroupId,
				input.tabId,
				input.cwd,
			);
		},
	);
}
