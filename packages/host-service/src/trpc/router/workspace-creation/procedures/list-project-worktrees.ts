import { z } from "zod";
import { protectedProcedure } from "../../../index";
import {
	requireLocalProject,
	requireProjectRepoPath,
} from "../shared/local-project";
import {
	listGitWorktrees,
	normalizeWorktreePath,
} from "../shared/worktree-list";
import {
	findWorktreeOwner,
	findWorktreeOwners,
} from "../shared/worktree-owners";

/**
 * Returns the live `git worktree list` for a project — only entries that
 * are valid adoption targets (have a real branch checked out, not bare,
 * not prunable) — annotated with whether a workspace row already tracks
 * them. Used by the v1→v2 importer to filter out v1 workspaces whose
 * worktree no longer exists on disk, by the sidebar's "Import
 * Worktrees" action to find untracked worktrees, and by the multi-repo
 * repository picker to offer existing worktrees.
 */
export const listProjectWorktrees = protectedProcedure
	.input(z.object({ projectId: z.string() }))
	.query(async ({ ctx, input }) => {
		const localProject = requireLocalProject(ctx, input.projectId);
		const repoPath = requireProjectRepoPath(localProject);
		const git = await ctx.git(repoPath);
		const records = await listGitWorktrees(git);
		const owners = findWorktreeOwners(ctx.db, repoPath);
		const mainRepoPath = normalizeWorktreePath(localProject.repoPath);

		const worktrees: {
			branch: string;
			path: string;
			hasWorkspace: boolean;
			workspaceId: string | null;
			isMainWorktree: boolean;
		}[] = [];
		for (const record of records) {
			if (record.bare) continue;
			if (record.prunable) continue;
			if (!record.branch) continue;
			const workspaceId = findWorktreeOwner(owners, {
				path: record.path,
				branch: record.branch,
			});
			worktrees.push({
				branch: record.branch,
				path: record.path,
				hasWorkspace: workspaceId !== null,
				workspaceId,
				isMainWorktree: normalizeWorktreePath(record.path) === mainRepoPath,
			});
		}
		return { worktrees };
	});
