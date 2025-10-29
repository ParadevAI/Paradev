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
export type TabType = "terminal" | "editor" | "browser" | "preview";

export interface Tab {
	id: string;
	name: string;
	type: TabType; // Type of content to display
	command?: string | null; // For terminal tabs
	cwd?: string; // Current working directory (for terminal tabs)
	order: number; // Explicit ordering - position in the grid (0, 1, 2, 3, ...)
	row: number; // Derived from order: floor(order / cols)
	col: number; // Derived from order: order % cols
	rowSpan?: number;
	colSpan?: number;
	createdAt: string;
}

export interface TabGroup {
	id: string;
	name: string;
	tabs: Tab[];
	rows: number;
	cols: number;
	createdAt: string;
}

export interface Worktree {
	id: string;
	branch: string;
	path: string;
	tabGroups: TabGroup[];
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
	activeTabGroupId: string | null;
	activeTabId: string | null;
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

export interface CreateTabGroupInput {
	workspaceId: string;
	worktreeId: string;
	name: string;
}

export interface CreateTabInput {
	workspaceId: string;
	worktreeId: string;
	tabGroupId: string;
	name: string;
	type?: TabType; // Optional - defaults to "terminal"
	command?: string | null;
	row: number;
	col: number;
	rowSpan?: number;
	colSpan?: number;
}

export interface UpdateWorkspaceInput {
	id: string;
	name?: string;
}
