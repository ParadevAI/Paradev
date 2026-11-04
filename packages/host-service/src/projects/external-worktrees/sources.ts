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
	/** Relative to the home directory. A repository inside it is the tool's own clone, not the user's. */
	homeDir: string;
	/** Relative to the home directory. */
	roots: { path: string; maxDepth: number }[];
}

// Default locations only; a user who moved a tool's worktree folder imports
// from the project's "Import untracked worktrees" action instead.
export const EXTERNAL_WORKTREE_SOURCES: readonly ExternalWorktreeSource[] = [
	{
		id: "conductor",
		homeDir: "conductor",
		roots: [{ path: "conductor/workspaces", maxDepth: 2 }],
	},
	{
		id: "t3code",
		homeDir: ".t3",
		roots: [{ path: ".t3/worktrees", maxDepth: 2 }],
	},
	{
		id: "orca",
		homeDir: "orca",
		roots: [{ path: "orca/workspaces", maxDepth: 2 }],
	},
	{
		id: "emdash",
		homeDir: "emdash",
		roots: [{ path: "emdash/worktrees", maxDepth: 2 }],
	},
	{
		id: "claude-squad",
		homeDir: ".claude-squad",
		roots: [{ path: ".claude-squad/worktrees", maxDepth: 1 }],
	},
	{
		id: "cursor",
		homeDir: ".cursor",
		roots: [{ path: ".cursor/worktrees", maxDepth: 2 }],
	},
	{
		id: "herdr",
		homeDir: ".herdr",
		roots: [{ path: ".herdr/worktrees", maxDepth: 2 }],
	},
	{
		id: "paseo",
		homeDir: ".paseo",
		roots: [{ path: ".paseo/worktrees", maxDepth: 2 }],
	},
];
