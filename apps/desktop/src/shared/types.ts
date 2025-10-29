import type { BrowserWindow, IpcMainInvokeEvent } from "electron";

import type { registerRoute } from "lib/electron-router-dom";

export type BrowserWindowOrNull = Electron.BrowserWindow | null;

type Route = Parameters<typeof registerRoute>[0];

export interface WindowProps extends Electron.BrowserWindowConstructorOptions {
	id: Route["id"];
	query?: Route["query"];
}

export interface WindowCreationByIPC {
	channel: string;
	window(): BrowserWindowOrNull;
	callback(window: BrowserWindow, event: IpcMainInvokeEvent): void;
}

// Workspace types - Tab-based Grid Layout

// Tab types that can be displayed
export type TabType = "terminal" | "editor" | "browser" | "preview" | "group";

export interface Tab {
	id: string;
	name: string;
	type: TabType; // Type of content to display
	// Terminal-specific properties
	command?: string | null; // For terminal tabs
	cwd?: string; // Current working directory (for terminal tabs)
	// Grid layout properties (used when type === "group")
	tabs?: Tab[]; // Child tabs when type is "group"
	rows?: number; // Number of rows in the grid (for group tabs)
	cols?: number; // Number of columns in the grid (for group tabs)
	rowSizes?: number[]; // Custom row sizes as fractions (e.g., [0.3, 0.7])
	colSizes?: number[]; // Custom column sizes as fractions (e.g., [0.5, 0.5])
	// Position properties (for tabs inside a group)
	order?: number; // Explicit ordering - position in the grid (0, 1, 2, 3, ...)
	row?: number; // Derived from order: floor(order / cols)
	col?: number; // Derived from order: order % cols
	rowSpan?: number;
	colSpan?: number;
	createdAt: string;
}

export interface Worktree {
	id: string;
	branch: string;
	path: string;
	tabs: Tab[]; // Changed from tabGroups to tabs
	createdAt: string;
}

export interface Workspace {
	id: string;
	name: string;
	repoPath: string;
	branch: string;
	worktrees: Worktree[];
	// Active selection for this workspace
	activeWorktreeId: string | null;
	activeTabId: string | null; // Unified tab selection (no more activeTabGroupId)
	createdAt: string;
	updatedAt: string;
}

export interface WorkspaceConfig {
	workspaces: Workspace[];
	lastOpenedWorkspaceId: string | null;
	activeWorkspaceId: string | null; // Currently active workspace
}

export interface CreateWorkspaceInput {
	name: string;
	repoPath: string;
	branch: string;
}

export interface CreateWorktreeInput {
	workspaceId: string;
	branch: string;
	createBranch?: boolean;
}

export interface CreateTabInput {
	workspaceId: string;
	worktreeId: string;
	parentTabId?: string; // Optional parent tab (for tabs inside a group)
	name: string;
	type?: TabType; // Optional - defaults to "terminal"
	command?: string | null;
	// Grid properties (for group tabs)
	rows?: number;
	cols?: number;
	// Position properties (for tabs inside a group)
	row?: number;
	col?: number;
	rowSpan?: number;
	colSpan?: number;
}

export interface UpdateWorkspaceInput {
	id: string;
	name?: string;
}
