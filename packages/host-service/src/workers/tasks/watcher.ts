import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
	type FindNestedRepoRootsOptions,
	type FindNestedRepoRootsResult,
	findNestedRepoRoots,
} from "@superset/workspace-fs/watch-scan";
import { gitCeilingEnv } from "../../runtime/git/ceiling.ts";
import { listGitIgnoredDirs } from "../../runtime/git/ignored-dirs.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export const nestedRepositoriesTask = defineWorkerTask<
	{
		rootPath: string;
		options: Omit<FindNestedRepoRootsOptions, "signal" | "now">;
	},
	FindNestedRepoRootsResult
>({
	type: "watcher/nested-repositories",
	handler: ({ rootPath, options }) => findNestedRepoRoots(rootPath, options),
});

async function ownGitDirectory(rootPath: string): Promise<string | null> {
	try {
		const { stdout } = await promisify(execFile)(
			"git",
			["rev-parse", "--git-dir"],
			{
				cwd: rootPath,
				timeout: 3_000,
				env: { ...process.env, ...gitCeilingEnv(rootPath) },
			},
		);
		return resolve(rootPath, stdout.trim());
	} catch {
		return null;
	}
}

/** `listGitIgnoredDirs` sets no ceiling, so it runs only in a folder that is a repository itself. */
export const ignoredDirectoriesTask = defineWorkerTask<
	{ rootPath: string },
	string[]
>({
	type: "watcher/ignored-directories",
	handler: async ({ rootPath }) =>
		(await ownGitDirectory(rootPath)) ? listGitIgnoredDirs(rootPath) : [],
});

export const gitDirectoryTask = defineWorkerTask<
	{ rootPath: string },
	string | null
>({
	type: "watcher/git-directory",
	handler: ({ rootPath }) => ownGitDirectory(rootPath),
});

export const watcherTasks = [
	nestedRepositoriesTask,
	ignoredDirectoriesTask,
	gitDirectoryTask,
];
