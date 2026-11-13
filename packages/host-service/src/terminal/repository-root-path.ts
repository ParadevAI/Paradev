import { isAbsolute, relative } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db/index.ts";
import { projects, repositories } from "../db/schema.ts";
import { listWorkspaceCheckouts } from "../workspaces/checkouts.ts";

/**
 * The main checkout of the repository whose checkout holds `cwd`, else the
 * project's primary repository. Empty for a project-less session workspace.
 */
export function repositoryRootPath(
	db: HostDb,
	workspace: { id: string; worktreePath: string; projectId: string | null },
	cwd: string = workspace.worktreePath,
): string {
	if (!workspace.projectId) return "";
	let holder: { path: string; repoPath: string } | undefined;
	for (const checkout of listWorkspaceCheckouts(db, workspace)) {
		const inside = relative(checkout.path, cwd);
		if (inside.startsWith("..") || isAbsolute(inside)) continue;
		if (!holder || checkout.path.length > holder.path.length) {
			holder = { path: checkout.path, repoPath: checkout.repository.repoPath };
		}
	}
	if (holder) return holder.repoPath;
	return (
		db
			.select({ repoPath: repositories.repoPath })
			.from(projects)
			.innerJoin(
				repositories,
				eq(repositories.id, projects.primaryRepositoryId),
			)
			.where(eq(projects.id, workspace.projectId))
			.get()?.repoPath ?? ""
	);
}
