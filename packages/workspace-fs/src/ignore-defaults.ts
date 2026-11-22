// Both the FsWatcherManager and the search-index `fast-glob` walk consume this
// list. Patterns matched here are not just hidden from consumers — on Linux
// they're applied at watch-creation time by @parcel/watcher, so no inotify
// watches are installed for matched dirs. That's the main lever against
// ENOSPC (inotify watch limit). On macOS FSEvents these are userspace-only
// filters; the kernel still queues events for ignored paths but consumers
// never see them.
export const DEFAULT_IGNORE_PATTERNS = [
	"**/node_modules/**",
	"**/.git/**",
	"**/dist/**",
	"**/build/**",
	"**/.next/**",
	"**/.turbo/**",
	"**/coverage/**",
	"**/.cache/**",
	"**/.parcel-cache/**",
	"**/.vite/**",
	"**/.svelte-kit/**",
	"**/.vercel/**",
	"**/target/**",
	"**/out/**",
	"**/.venv/**",
	"**/vendor/**",
	"**/.gradle/**",
	"**/.pnpm-store/**",
	"**/.yarn/**",
	// Agent/worktree tools pile up sibling git worktrees under these dirs — a
	// full repo copy each, with its own node_modules. Left unignored, watching a
	// project that contains one balloons the watcher to millions of directories.
	// The nested-repo prune in watch.ts catches any worktree generically by its
	// `.git` marker; these globs are the cheap native backstop for the known
	// conventions (Claude Code, `git worktree` under `.worktrees`, Conductor),
	// and still prune even if that scan is truncated on a pathological tree.
	"**/.worktrees/**",
	"**/.claude/worktrees/**",
	"**/.conductor/**",
	"**/*.tsbuildinfo",
];

/**
 * Directory basenames the nested-repo discovery scan (watch.ts) prunes as it
 * walks, so it never descends into the heavy ignored trees (node_modules, .git,
 * …). Derived from the single-segment `**\/<name>/**` entries above so the two
 * ignore surfaces can't drift. Multi-segment globs (`.claude/worktrees`) are
 * intentionally excluded: the scan still traverses `.claude/` and discovers the
 * worktrees generically by their `.git` marker.
 */
export const DEFAULT_IGNORE_DIR_NAMES: ReadonlySet<string> = new Set(
	DEFAULT_IGNORE_PATTERNS.map(
		(pattern) => /^\*\*\/([^/*]+)\/\*\*$/.exec(pattern)?.[1],
	).filter((name): name is string => name !== undefined),
);
