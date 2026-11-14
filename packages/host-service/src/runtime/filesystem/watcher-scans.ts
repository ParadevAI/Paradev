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

function multiRepoCheckouts(db: HostDb, rootPath: string) {
	return db
		.select({ id: workspaces.id, worktreePath: workspaces.worktreePath })
		.from(workspaces)
		.where(eq(workspaces.worktreePath, rootPath))
		.all()
		.map((workspace) => listWorkspaceCheckouts(db, workspace))
		.find((list) => list.length > 1);
}

/** Each checkout of a multi-repo workspace holds `.git` but is watched: the scan runs inside it. */
export async function scanWorkspaceNestedRepositories(
	db: HostDb,
	rootPath: string,
	options: Parameters<typeof findNestedRepoRoots>[1],
	scan: typeof findNestedRepoRoots = scanNestedRepositories,
): ReturnType<typeof findNestedRepoRoots> {
	const checkouts = multiRepoCheckouts(db, rootPath);
	if (!checkouts) return scan(rootPath, options);
	const checkoutPaths = new Set(checkouts.map(({ path }) => path));
	const results = await Promise.all([
		scan(rootPath, options),
		...checkouts.map(({ path }) => scan(path, options)),
	]);
	return {
		roots: results
			.flatMap((result) => result.roots)
			.filter((root) => !checkoutPaths.has(root)),
		truncated: results.some((result) => result.truncated),
	};
}

/** A multi-repo workspace folder is no repository: each checkout is asked, its dirs under `<name>/`. */
export async function scanWorkspaceGitIgnoredDirectories(
	db: HostDb,
	rootPath: string,
	signal?: AbortSignal,
	scan: typeof scanGitIgnoredDirectories = scanGitIgnoredDirectories,
): Promise<string[]> {
	const checkouts = multiRepoCheckouts(db, rootPath);
	if (!checkouts) return scan(rootPath, signal);
	const perCheckout = await Promise.all(
		checkouts.map(async ({ path, repository }) =>
			(await scan(path, signal)).map((dir) => `${repository.name}/${dir}`),
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
