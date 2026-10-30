import {
	readLegacyHomeMove,
	repairGitWorktrees,
	rewriteLegacyHomePaths,
	type SqliteRunner,
} from "@superset/agent-setup/legacy-home-move";
import { resolveAppHomeDir } from "@superset/agent-setup/paths";
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { projects, workspaces } from "../../db/schema.ts";

const PATH_COLUMNS = [
	["projects", "repo_path"],
	["projects", "worktree_base_dir"],
	["host_settings", "worktree_base_dir"],
	["host_settings", "default_claude_config_dir"],
	["workspaces", "worktree_path"],
	["terminal_agent_bindings", "transcript_path"],
] as const;

type SyncDb = BaseSQLiteDatabase<"sync", unknown, Record<string, unknown>> & {
	$client: SqliteRunner;
};

/**
 * After the app home moved, rewrites host.db's absolute paths to it and
 * repairs git's worktree records in the background. Never throws: a failure
 * leaves the old paths, which still work through the `~/.superset` symlink.
 */
export async function applyLegacyHomeMove(
	db: SyncDb,
	appHomeDir = resolveAppHomeDir(),
): Promise<void> {
	const move = readLegacyHomeMove(appHomeDir);
	if (!move) return;
	try {
		if (rewriteLegacyHomePaths(db.$client, PATH_COLUMNS, move) === 0) return;
		const moved = db
			.select({
				repoPath: projects.repoPath,
				worktreePath: workspaces.worktreePath,
			})
			.from(workspaces)
			.innerJoin(projects, eq(workspaces.projectId, projects.id))
			.all()
			.filter(({ worktreePath }) => worktreePath.startsWith(`${move.to}/`));
		await repairGitWorktrees(moved);
	} catch (error) {
		console.error("[host-service] Could not rewrite moved paths:", error);
	}
}
