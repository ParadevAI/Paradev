import {
	readLegacyHomeMove,
	repairGitWorktrees,
	rewriteLegacyHomePaths,
	type SqliteRunner,
} from "@superset/agent-setup/legacy-home-move";
import { resolveAppHomeDir } from "@superset/agent-setup/paths";
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import {
	repositories,
	workspaceRepositories,
	workspaces,
} from "../../db/schema.ts";
import { checkoutPath } from "../../workspaces/checkouts.ts";

const PATH_COLUMNS = [
	["repositories", "repo_path"],
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
		rewriteLegacyHomePaths(db.$client, PATH_COLUMNS, move);
		const rows = db
			.select({
				workspaceId: workspaces.id,
				workspacePath: workspaces.worktreePath,
				repoPath: repositories.repoPath,
				name: repositories.name,
			})
			.from(workspaceRepositories)
			.innerJoin(
				workspaces,
				eq(workspaces.id, workspaceRepositories.workspaceId),
			)
			.innerJoin(
				repositories,
				eq(repositories.id, workspaceRepositories.repositoryId),
			)
			.all();
		const checkoutCount = new Map<string, number>();
		for (const row of rows) {
			checkoutCount.set(
				row.workspaceId,
				(checkoutCount.get(row.workspaceId) ?? 0) + 1,
			);
		}
		const moved = rows
			.map((row) => ({
				repoPath: row.repoPath,
				worktreePath: checkoutPath(
					row.workspacePath,
					row.name,
					checkoutCount.get(row.workspaceId) ?? 1,
				),
			}))
			.filter(({ worktreePath }) => worktreePath.startsWith(`${move.to}/`));
		await repairGitWorktrees(moved, move.from);
	} catch (error) {
		console.error("[host-service] Could not rewrite moved paths:", error);
	}
}
