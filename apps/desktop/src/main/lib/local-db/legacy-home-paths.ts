import {
	readLegacyHomeMove,
	repairGitWorktrees,
	rewriteLegacyHomePaths,
	type SqliteRunner,
} from "@superset/agent-setup/legacy-home-move";
import { projects, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

export const PATH_COLUMNS = [
	["projects", "main_repo_path"],
	["projects", "worktree_base_dir"],
	["worktrees", "path"],
	["settings", "worktree_base_dir"],
	["downloads", "save_path"],
	["screenshots", "save_path"],
] as const;

/**
 * After the app home moved, rewrites local.db's absolute paths to it and
 * repairs git's worktree records in the background. Never throws: a failure
 * leaves the old paths, which still work through the `~/.superset` symlink.
 */
export async function applyLegacyHomeMove(
	sqlite: SqliteRunner,
	db: BaseSQLiteDatabase<"sync", unknown, Record<string, unknown>>,
	appHomeDir: string,
): Promise<void> {
	const move = readLegacyHomeMove(appHomeDir);
	if (!move) return;
	try {
		if (rewriteLegacyHomePaths(sqlite, PATH_COLUMNS, move) === 0) return;
		const moved = db
			.select({ repoPath: projects.mainRepoPath, worktreePath: worktrees.path })
			.from(worktrees)
			.innerJoin(projects, eq(worktrees.projectId, projects.id))
			.all()
			.filter(({ worktreePath }) => worktreePath.startsWith(`${move.to}/`));
		await repairGitWorktrees(moved);
	} catch (error) {
		console.error("[local-db] Could not rewrite moved paths:", error);
	}
}
