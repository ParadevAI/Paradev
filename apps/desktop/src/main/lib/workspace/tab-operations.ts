import { randomUUID } from "node:crypto";

import type { CreateTabInput, Tab, Workspace, Worktree } from "shared/types";

import configManager from "../config-manager";
import {
	findParentTab,
	findTab,
	isValidParentTab,
	recalculateTabPositions,
	removeTabRecursive,
} from "./tab-helpers";

/**
 * Create a new tab in a worktree or inside a parent tab
 */
export async function createTab(
	workspace: Workspace,
	input: CreateTabInput,
): Promise<{ success: boolean; tab?: Tab; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		const tab: Tab = {
			id: randomUUID(),
			name: input.name,
			type: input.type || "terminal", // Default to terminal if not specified
			createdAt: new Date().toISOString(),
		};

		// Type-specific properties
		if (tab.type === "terminal") {
			tab.command = input.command;
		} else if (tab.type === "group") {
			tab.tabs = [];
			tab.rows = input.rows || 2;
			tab.cols = input.cols || 2;
		}

		// Position properties (for tabs inside a group)
		if (input.parentTabId) {
			const parentTab = findTab(worktree.tabs, input.parentTabId);
			if (!isValidParentTab(parentTab)) {
				return {
					success: false,
					error: "Parent tab not found or not a group",
				};
			}

			if (
				input.row !== undefined &&
				input.col !== undefined &&
				parentTab?.cols
			) {
				tab.order = input.row * parentTab.cols + input.col;
				tab.row = input.row;
				tab.col = input.col;
			}
			tab.rowSpan = input.rowSpan;
			tab.colSpan = input.colSpan;

			parentTab!.tabs = parentTab!.tabs || [];
			parentTab!.tabs.push(tab);
		} else {
			// Top-level tab in worktree
			worktree.tabs.push(tab);
		}

		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true, tab };
	} catch (error) {
		console.error("Failed to create tab:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Delete a tab from a worktree
 */
export async function deleteTab(
	workspace: Workspace,
	input: {
		worktreeId: string;
		tabId: string;
	},
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		if (!removeTabRecursive(worktree.tabs, input.tabId)) {
			return { success: false, error: "Tab not found" };
		}

		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to delete tab:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Reorder tabs within a parent tab or at worktree level
 */
export async function reorderTabs(
	workspace: Workspace,
	input: {
		worktreeId: string;
		parentTabId?: string;
		tabIds: string[];
	},
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		let tabs: Tab[];
		let cols: number;

		if (input.parentTabId) {
			// Reorder tabs inside a parent group
			const parentTab = findTab(worktree.tabs, input.parentTabId);
			if (!isValidParentTab(parentTab)) {
				return {
					success: false,
					error: "Parent tab not found or not a group",
				};
			}
			tabs = parentTab!.tabs || [];
			cols = parentTab!.cols || 2;
		} else {
			// Reorder tabs at worktree level
			tabs = worktree.tabs;
			cols = 2; // Default cols for worktree level
		}

		// Reorder tabs based on tabIds array
		const reorderedTabs = input.tabIds
			.map((id) => tabs.find((t) => t.id === id))
			.filter((t): t is Tab => t !== undefined);

		// Verify all tabs are present
		if (reorderedTabs.length !== tabs.length) {
			return { success: false, error: "Tab count mismatch during reorder" };
		}

		// Recalculate positions
		const updatedTabs = recalculateTabPositions(reorderedTabs, cols);

		// Update the tabs array
		if (input.parentTabId) {
			const parentTab = findTab(worktree.tabs, input.parentTabId);
			parentTab!.tabs = updatedTabs;
		} else {
			worktree.tabs = updatedTabs;
		}

		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to reorder tabs:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Move a tab from one parent to another
 */
export async function moveTab(
	workspace: Workspace,
	input: {
		worktreeId: string;
		tabId: string;
		sourceParentTabId?: string;
		targetParentTabId?: string;
		targetIndex: number;
	},
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		// Find source and target tab arrays
		let sourceTabs: Tab[];
		let targetTabs: Tab[];
		let sourceCols: number;
		let targetCols: number;

		if (input.sourceParentTabId) {
			const sourceParent = findTab(worktree.tabs, input.sourceParentTabId);
			if (!isValidParentTab(sourceParent)) {
				return { success: false, error: "Source parent tab not found" };
			}
			sourceTabs = sourceParent!.tabs || [];
			sourceCols = sourceParent!.cols || 2;
		} else {
			sourceTabs = worktree.tabs;
			sourceCols = 2;
		}

		if (input.targetParentTabId) {
			const targetParent = findTab(worktree.tabs, input.targetParentTabId);
			if (!isValidParentTab(targetParent)) {
				return { success: false, error: "Target parent tab not found" };
			}
			targetTabs = targetParent!.tabs || [];
			targetCols = targetParent!.cols || 2;
		} else {
			targetTabs = worktree.tabs;
			targetCols = 2;
		}

		// Find and remove the tab from source
		const tabIndex = sourceTabs.findIndex((t) => t.id === input.tabId);
		if (tabIndex === -1) {
			return { success: false, error: "Tab not found in source" };
		}

		const [tab] = sourceTabs.splice(tabIndex, 1);

		// Insert into target at specified index
		targetTabs.splice(input.targetIndex, 0, tab);

		// Recalculate positions for both source and target
		if (input.sourceParentTabId) {
			const sourceParent = findTab(worktree.tabs, input.sourceParentTabId);
			sourceParent!.tabs = recalculateTabPositions(sourceTabs, sourceCols);
		} else {
			worktree.tabs = recalculateTabPositions(sourceTabs, sourceCols);
		}

		if (input.targetParentTabId) {
			const targetParent = findTab(worktree.tabs, input.targetParentTabId);
			targetParent!.tabs = recalculateTabPositions(targetTabs, targetCols);
		} else {
			worktree.tabs = recalculateTabPositions(targetTabs, targetCols);
		}

		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to move tab:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Update grid sizes for a group tab
 */
export async function updateTabGridSizes(
	workspace: Workspace,
	input: {
		worktreeId: string;
		tabId: string;
		rowSizes?: number[];
		colSizes?: number[];
	},
): Promise<{ success: boolean; error?: string }> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return { success: false, error: "Worktree not found" };
		}

		const tab = findTab(worktree.tabs, input.tabId);
		if (!tab) {
			return { success: false, error: "Tab not found" };
		}

		if (tab.type !== "group") {
			return { success: false, error: "Tab is not a group" };
		}

		// Update sizes
		if (input.rowSizes !== undefined) {
			tab.rowSizes = input.rowSizes;
		}
		if (input.colSizes !== undefined) {
			tab.colSizes = input.colSizes;
		}

		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return { success: true };
	} catch (error) {
		console.error("Failed to update tab grid sizes:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Update terminal CWD for a tab
 */
export async function updateTerminalCwd(
	workspace: Workspace,
	input: {
		worktreeId: string;
		tabId: string;
		cwd: string;
	},
): Promise<boolean> {
	try {
		const worktree = workspace.worktrees.find(
			(wt) => wt.id === input.worktreeId,
		);
		if (!worktree) {
			return false;
		}

		const tab = findTab(worktree.tabs, input.tabId);
		if (!tab || tab.type !== "terminal") {
			return false;
		}

		tab.cwd = input.cwd;
		workspace.updatedAt = new Date().toISOString();

		// Save
		const config = configManager.read();
		const index = config.workspaces.findIndex((ws) => ws.id === workspace.id);
		if (index !== -1) {
			config.workspaces[index] = workspace;
			configManager.write(config);
		}

		return true;
	} catch (error) {
		console.error("Failed to update terminal CWD:", error);
		return false;
	}
}
