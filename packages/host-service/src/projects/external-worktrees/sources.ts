export const EXTERNAL_WORKTREE_SOURCE_IDS = [
	"conductor",
	"t3code",
	"orca",
	"emdash",
	"claude-squad",
	"cursor",
	"herdr",
	"paseo",
] as const;

export type ExternalWorktreeSourceId =
	(typeof EXTERNAL_WORKTREE_SOURCE_IDS)[number];

export interface ExternalWorktreeSource {
	id: ExternalWorktreeSourceId;
	/** Relative to the home directory. Repositories inside them are the tool's own clones, not the user's. */
	toolOwnedDirs: string[];
	/** Relative to the home directory. */
	roots: { path: string; maxDepth: number }[];
}

// Default locations only; a user who moved a tool's worktree folder imports
// from the project's "Import untracked worktrees" action instead.
export const EXTERNAL_WORKTREE_SOURCES: readonly ExternalWorktreeSource[] = [
	{
		id: "conductor",
		toolOwnedDirs: [
			"conductor/cloud-workspaces",
			"conductor/remote-workspace-sync",
		],
		roots: [{ path: "conductor/workspaces", maxDepth: 2 }],
	},
	{
		id: "t3code",
		toolOwnedDirs: [],
		roots: [{ path: ".t3/worktrees", maxDepth: 2 }],
	},
	{
		id: "orca",
		toolOwnedDirs: [],
		roots: [{ path: "orca/workspaces", maxDepth: 2 }],
	},
	{
		id: "emdash",
		toolOwnedDirs: [],
		roots: [{ path: "emdash/worktrees", maxDepth: 2 }],
	},
	{
		id: "claude-squad",
		toolOwnedDirs: [],
		roots: [{ path: ".claude-squad/worktrees", maxDepth: 1 }],
	},
	{
		id: "cursor",
		toolOwnedDirs: [],
		roots: [{ path: ".cursor/worktrees", maxDepth: 2 }],
	},
	{
		id: "herdr",
		toolOwnedDirs: [],
		roots: [{ path: ".herdr/worktrees", maxDepth: 2 }],
	},
	{
		id: "paseo",
		toolOwnedDirs: [],
		roots: [{ path: ".paseo/worktrees", maxDepth: 2 }],
	},
];
