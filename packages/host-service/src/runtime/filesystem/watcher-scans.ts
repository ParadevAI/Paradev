import { realpath } from "node:fs/promises";
import { basename } from "node:path";
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

async function workspacesAt(db: HostDb, rootPath: string) {
	const columns = { id: workspaces.id, worktreePath: workspaces.worktreePath };
	const exact = db
		.select(columns)
		.from(workspaces)
		.where(eq(workspaces.worktreePath, rootPath))
		.all();
	if (exact.length > 0) return exact;
	// The watcher hands over the real path; a stored path may go through a symlink.
	const sameName = db
		.select(columns)
		.from(workspaces)
		.all()
		.filter(
			(workspace) => basename(workspace.worktreePath) === basename(rootPath),
		);
	const realPaths = await Promise.all(
		sameName.map((workspace) =>
			realpath(workspace.worktreePath).catch(() => null),
		),
	);
	return sameName.filter((_, index) => realPaths[index] === rootPath);
}

async function multiRepoCheckouts(db: HostDb, rootPath: string) {
	return (await workspacesAt(db, rootPath))
		.map((workspace) =>
			listWorkspaceCheckouts(db, { id: workspace.id, worktreePath: rootPath }),
		)
		.find((list) => list.length > 1);
}

/** Each checkout of a multi-repo workspace holds `.git` but is watched: the scan runs inside it. */
export async function scanWorkspaceNestedRepositories(
	db: HostDb,
	rootPath: string,
	options: Parameters<typeof findNestedRepoRoots>[1],
	scan: typeof findNestedRepoRoots = scanNestedRepositories,
): ReturnType<typeof findNestedRepoRoots> {
	const checkouts = await multiRepoCheckouts(db, rootPath);
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
	const checkouts = await multiRepoCheckouts(db, rootPath);
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
