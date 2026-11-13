import type { findNestedRepoRoots } from "@superset/workspace-fs/watch-scan";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../db/index.ts";
import { workspaces } from "../../db/schema.ts";
import { getHostWorkerPool } from "../../workers/host-worker-pool.ts";
import {
	gitDirectoryTask,
	ignoredDirectoriesTask,
	nestedRepositoriesTask,
} from "../../workers/tasks/watcher.ts";
import { listWorkspaceCheckouts } from "../../workspaces/checkouts.ts";

export const scanNestedRepositories: typeof findNestedRepoRoots = (
	rootPath,
	{ signal, now: _now, ...options },
) =>
	getHostWorkerPool().run(
		nestedRepositoriesTask,
		{ rootPath, options },
		{ signal },
	);

export function scanGitIgnoredDirectories(
	rootPath: string,
	signal?: AbortSignal,
): Promise<string[]> {
	return getHostWorkerPool().run(
		ignoredDirectoriesTask,
		{ rootPath },
		{ signal },
	);
}

/** A multi-repo workspace folder is no repository: each checkout is asked, its dirs under `<name>/`. */
export async function scanWorkspaceGitIgnoredDirectories(
	db: HostDb,
	rootPath: string,
	signal?: AbortSignal,
): Promise<string[]> {
	const checkouts = db
		.select({ id: workspaces.id, worktreePath: workspaces.worktreePath })
		.from(workspaces)
		.where(eq(workspaces.worktreePath, rootPath))
		.all()
		.map((workspace) => listWorkspaceCheckouts(db, workspace))
		.find((list) => list.length > 1);
	if (!checkouts) return scanGitIgnoredDirectories(rootPath, signal);
	const perCheckout = await Promise.all(
		checkouts.map(async ({ path, repository }) =>
			(await scanGitIgnoredDirectories(path, signal)).map(
				(dir) => `${repository.name}/${dir}`,
			),
		),
	);
	return perCheckout.flat();
}

export function resolveGitDirectory(
	rootPath: string,
	signal: AbortSignal,
): Promise<string | null> {
	return getHostWorkerPool().run(gitDirectoryTask, { rootPath }, { signal });
}
