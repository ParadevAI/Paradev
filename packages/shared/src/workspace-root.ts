import { WORKSPACE_ATTACHMENTS_DIR } from "./workspace-attachments";

export const WORKSPACE_CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

export const WORKSPACE_AGENT_FOLDERS = [
	".agents",
	".claude",
	".codex",
	".cursor",
] as const;

/** The app's own folder in a workspace; it holds `WORKSPACE_ATTACHMENTS_DIR`. */
export const WORKSPACE_APP_FOLDER = WORKSPACE_ATTACHMENTS_DIR.split(
	"/",
)[0] as string;

/**
 * Top-level entries the host makes in a multi-repo workspace root, besides
 * the checkout folders. No repository of such a workspace can use one as its
 * folder name.
 */
export const WORKSPACE_ROOT_ENTRIES = [
	...WORKSPACE_CONTEXT_FILES,
	".mcp.json",
	...WORKSPACE_AGENT_FOLDERS,
	WORKSPACE_APP_FOLDER,
] as const;

const RESERVED_ROOT_NAMES = new Set(
	WORKSPACE_ROOT_ENTRIES.map((entry) => entry.toLowerCase()),
);

/** Compares the way a case-insensitive disk would. */
export function isReservedRootName(name: string): boolean {
	return RESERVED_ROOT_NAMES.has(name.toLowerCase());
}
