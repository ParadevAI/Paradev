import { and, eq, inArray, isNull } from "drizzle-orm";
import {
	repositories,
	workspaceRepositories,
	workspaces,
} from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { listCheckoutsByWorkspaceId } from "../../../../workspaces/checkouts";
import { normalizeWorktreePath } from "./worktree-list";

export interface WorktreeOwners {
	byBranch: Map<string, string>;
	byPath: Map<string, string>;
}

/**
 * The live workspaces with a checkout of any repository at `repoPath`, keyed
 * by the checkout's branch and by its path. A worktree used by any of them is
 * taken.
 */
export function findWorktreeOwners(
	db: HostServiceContext["db"],
	repoPath: string,
): WorktreeOwners {
	const repo = normalizeWorktreePath(repoPath);
	const repositoryIds = new Set(
		db
			.select({ id: repositories.id, repoPath: repositories.repoPath })
			.from(repositories)
			.all()
			.filter((row) => normalizeWorktreePath(row.repoPath) === repo)
			.map((row) => row.id),
	);
	const owners: WorktreeOwners = { byBranch: new Map(), byPath: new Map() };
	if (repositoryIds.size === 0) return owners;
	const rows = db
		.selectDistinct({
			id: workspaces.id,
			worktreePath: workspaces.worktreePath,
		})
		.from(workspaces)
		.innerJoin(
			workspaceRepositories,
			eq(workspaceRepositories.workspaceId, workspaces.id),
		)
		.where(
			and(
				inArray(workspaceRepositories.repositoryId, [...repositoryIds]),
				isNull(workspaces.archivedAt),
			),
		)
		.all();
	for (const [workspaceId, checkouts] of listCheckoutsByWorkspaceId(db, rows)) {
		for (const checkout of checkouts) {
			if (!repositoryIds.has(checkout.repository.id)) continue;
			if (checkout.row.branch) {
				owners.byBranch.set(checkout.row.branch, workspaceId);
			}
			owners.byPath.set(normalizeWorktreePath(checkout.path), workspaceId);
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
