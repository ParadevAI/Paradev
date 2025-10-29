import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import type {
	CreateWorktreeInput,
	Tab,
	Workspace,
	Worktree,
} from "shared/types";

import configManager from "../config-manager";
import worktreeManager from "../worktree-manager";

// Function to create default tabs for a 2x2 grid layout
function createDefaultTabs(): Tab[] {
	const now = new Date().toISOString();
	const cols = 2; // 2x2 grid
	return [
		{
			id: randomUUID(),
			name: "Terminal 1",
			type: "terminal",
			order: 0,
			row: 0, // floor(0 / 2) = 0
			col: 0, // 0 % 2 = 0
			command: null,
			createdAt: now,
		},
		{
			id: randomUUID(),
			name: "Terminal 2",
			type: "terminal",
			order: 1,
			row: 0, // floor(1 / 2) = 0
			col: 1, // 1 % 2 = 1
			command: null,
			createdAt: now,
		},
		{
			id: randomUUID(),
			name: "Terminal 3",
			type: "terminal",
			order: 2,
			row: 1, // floor(2 / 2) = 1
			col: 0, // 2 % 2 = 0
			command: null,
			createdAt: now,
		},
		{
			id: randomUUID(),
			name: "Terminal 4",
			type: "terminal",
			order: 3,
			row: 1, // floor(3 / 2) = 1
			col: 1, // 3 % 2 = 1
			command: null,
			createdAt: now,
		},
	];
}

/**
 * Create a new worktree with a default tab group and tabs
 */
export async function createWorktree(
	workspace: Workspace,
	input: CreateWorktreeInput,
): Promise<{ success: boolean; worktree?: Worktree; error?: string }> {
	try {
		// Create git worktree
		const worktreeResult = await worktreeManager.createWorktree(
			workspace.repoPath,
			input.branch,
			input.createBranch || false,
		);

		if (!worktreeResult.success) {
			return {
				success: false,
				error: `Failed to create worktree: ${worktreeResult.error}`,
			};
		}

		// Create default tabs for 2x2 layout
		const now = new Date().toISOString();
		const defaultTabs = createDefaultTabs();

		// Create default group tab with 4 terminal tabs in 2x2 grid
		const defaultGroupTab: Tab = {
			id: randomUUID(),
			name: "Default",
			type: "group",
			tabs: defaultTabs,
			rows: 2,
			cols: 2,
			createdAt: now,
		};

		// Create worktree object
		const worktree: Worktree = {
			id: randomUUID(),
			branch: input.branch,
			path: worktreeResult.path!,
			tabs: [defaultGroupTab],
			createdAt: now,
		};

		// Add to workspace
		workspace.worktrees.push(worktree);
		workspace.updatedAt = now;

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true, worktree };
	} catch (error) {
		console.error("Failed to create worktree:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
	workspace: Workspace,
	worktreeId: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Remove git worktree
		await worktreeManager.removeWorktree(workspace.repoPath, worktree.path);

		// Remove from workspace
		workspace.worktrees = workspace.worktrees.filter(
			(wt) => wt.id !== worktreeId,
		);
		workspace.updatedAt = new Date().toISOString();

		// Save to config
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to remove worktree:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Check if a worktree can be merged into the active worktree
 */
export async function canMergeWorktree(
	workspace: Workspace,
	worktreeId: string,
): Promise<{
	success: boolean;
	canMerge?: boolean;
	reason?: string;
	error?: string;
	isActiveWorktree?: boolean;
	hasUncommittedChanges?: boolean;
}> {
	try {
		const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Check if this is the active worktree
		if (workspace.activeWorktreeId === worktreeId) {
			return {
				success: true,
				canMerge: false,
				reason: "Cannot merge the active worktree into itself",
				isActiveWorktree: true,
			};
		}

		// Find the active worktree
		const activeWorktree = workspace.worktrees.find(
			(wt) => wt.id === workspace.activeWorktreeId,
		);
		if (!activeWorktree) {
			return {
				success: true,
				canMerge: false,
				reason: "No active worktree found",
			};
		}

		// Check if the source branch can be merged into the active worktree
		const canMerge = await worktreeManager.canMerge(
			activeWorktree.path,
			worktree.branch,
		);

		return {
			success: true,
			canMerge: canMerge.canMerge,
			reason: canMerge.reason,
			hasUncommittedChanges: canMerge.hasUncommittedChanges,
			isActiveWorktree: false,
		};
	} catch (error) {
		console.error("Failed to check if worktree can be merged:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Merge a worktree into the active worktree
 */
export async function mergeWorktree(
	workspace: Workspace,
	worktreeId: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Check if this is the active worktree
		if (workspace.activeWorktreeId === worktreeId) {
			return {
				success: false,
				error: "Cannot merge the active worktree into itself",
			};
		}

		// Find the active worktree
		const activeWorktree = workspace.worktrees.find(
			(wt) => wt.id === workspace.activeWorktreeId,
		);
		if (!activeWorktree) {
			return { success: false, error: "No active worktree found" };
		}

		// Merge the source branch into the active worktree
		const result = await worktreeManager.merge(
			activeWorktree.path,
			worktree.branch,
		);

		if (!result.success) {
			return { success: false, error: result.error };
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to merge worktree:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Get the path of a worktree
 */
export function getWorktreePath(
	workspace: Workspace,
	worktreeId: string,
): string | null {
	const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
	return worktree?.path || null;
}

/**
 * Scan and import existing git worktrees
 */
export async function scanAndImportWorktrees(
	workspace: Workspace,
): Promise<{ success: boolean; imported?: number; error?: string }> {
	try {
		// Get all git worktrees from the repository
		const gitWorktrees = worktreeManager.listWorktrees(workspace.repoPath);

		// Include all worktrees (including main repo) that actually exist on filesystem
		const allWorktrees = gitWorktrees.filter(
			(wt) => !wt.bare && existsSync(wt.path),
		);

		// Create a set of valid worktree paths for quick lookup
		const validWorktreePaths = new Set(allWorktrees.map((wt) => wt.path));

		let importedCount = 0;
		let configChanged = false;
		const now = new Date().toISOString();

		// Remove worktrees that no longer exist (either not in git or not on filesystem)
		const initialWorktreeCount = workspace.worktrees.length;
		workspace.worktrees = workspace.worktrees.filter((wt) => {
			// Remove if not in git's worktree list OR if path doesn't exist on filesystem
			if (!validWorktreePaths.has(wt.path) || !existsSync(wt.path)) {
				configChanged = true;
				return false;
			}
			return true;
		});
		const removedCount = initialWorktreeCount - workspace.worktrees.length;

		for (const gitWorktree of allWorktrees) {
			// Get the actual current branch for this worktree path
			const currentBranch =
				worktreeManager.getCurrentBranch(gitWorktree.path) ||
				gitWorktree.branch;

			// Check if this worktree is already in our workspace
			const existingWorktree = workspace.worktrees.find(
				(wt) => wt.path === gitWorktree.path,
			);

			if (existingWorktree) {
				// Update the branch if it has changed
				if (existingWorktree.branch !== currentBranch) {
					existingWorktree.branch = currentBranch;
					importedCount++;
					configChanged = true;
				}
			} else {
				// Create default tabs for 2x2 layout
				const defaultTabs = createDefaultTabs();

				// Create default group tab with 4 tabs in 2x2 grid
				const defaultGroupTab: Tab = {
					id: randomUUID(),
					name: "Default",
					type: "group",
					tabs: defaultTabs,
					rows: 2,
					cols: 2,
					createdAt: now,
				};

				// Create worktree object
				const worktree: Worktree = {
					id: randomUUID(),
					branch: currentBranch,
					path: gitWorktree.path,
					tabs: [defaultGroupTab],
					createdAt: now,
				};

				workspace.worktrees.push(worktree);
				importedCount++;
				configChanged = true;
			}
		}

		if (configChanged) {
			workspace.updatedAt = now;

			// Save to config
			const config = configManager.read();
			const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
			if (index !== -1) {
				config.workspaces[index] = workspace;
				configManager.write(config);
			}
		}

		if (removedCount > 0) {
			console.log(`Removed ${removedCount} deleted worktree(s) from config`);
		}

		return { success: true, imported: importedCount };
	} catch (error) {
		console.error("Failed to scan and import worktrees:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
