import { and, inArray, isNull } from "drizzle-orm";
import { projects, workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { normalizeWorktreePath } from "./worktree-list";

export interface WorktreeOwners {
	byBranch: Map<string, string>;
	byPath: Map<string, string>;
}

/**
 * The live workspaces of every project on this repository, keyed by branch and
 * by worktree path. A repository can belong to its own project and to a
 * multi-repo project at once; a worktree used by either is taken.
 */
export function findWorktreeOwners(
	db: HostServiceContext["db"],
	repoPath: string,
): WorktreeOwners {
	const repo = normalizeWorktreePath(repoPath);
	const projectIds = db
		.select({ id: projects.id, repoPath: projects.repoPath })
		.from(projects)
		.all()
		.filter(
			(project) =>
				project.repoPath && normalizeWorktreePath(project.repoPath) === repo,
		)
		.map((project) => project.id);
	const owners: WorktreeOwners = { byBranch: new Map(), byPath: new Map() };
	if (projectIds.length === 0) return owners;
	const rows = db
		.select({
			id: workspaces.id,
			branch: workspaces.branch,
			worktreePath: workspaces.worktreePath,
		})
		.from(workspaces)
		.where(
			and(
				inArray(workspaces.projectId, projectIds),
				isNull(workspaces.archivedAt),
			),
		)
		.all();
	for (const row of rows) {
		if (row.branch) owners.byBranch.set(row.branch, row.id);
		if (row.worktreePath) {
			owners.byPath.set(normalizeWorktreePath(row.worktreePath), row.id);
		}
	}
	return owners;
}

export function findWorktreeOwner(
	owners: WorktreeOwners,
	worktree: { path: string; branch: string },
): string | null {
	return (
		owners.byPath.get(normalizeWorktreePath(worktree.path)) ??
		owners.byBranch.get(worktree.branch) ??
		null
	);
}
