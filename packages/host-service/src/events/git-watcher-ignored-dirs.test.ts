import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { GitWatcher } from "./git-watcher";

interface Internals {
	refreshIgnoredDirs(
		workspaceId: string,
		worktreePath: string,
		force?: boolean,
	): void;
	getOrCreateIgnoredDirsState(workspaceId: string): {
		dirs: ReadonlySet<string>;
		refreshing: boolean;
		lastRefreshAt: number;
	};
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function waitFor(check: () => boolean) {
	const deadline = Date.now() + 3_000;
	while (!check()) {
		if (Date.now() > deadline) throw new Error("watch state did not settle");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

test("a dir that becomes gitignored after attach makes the native watcher re-derive its prune", async () => {
	const repo = await mkdtemp(join(tmpdir(), "git-watch-ignored-"));
	await simpleGit(repo).init();
	await writeFile(join(repo, ".gitignore"), "node_modules/\ndist/\n");
	const workspaceId = "ignored-growth";
	const row = { id: workspaceId, worktreePath: repo };
	const db = {
		select: () => ({
			from: () => ({ where: () => ({ get: () => row, all: () => [row] }) }),
		}),
	};
	const quietStream = {
		[Symbol.asyncIterator]: () => ({
			next: () => new Promise<never>(() => {}),
			return: async () => ({ done: true, value: undefined }),
		}),
	};
	const watcherRefreshes: Array<[string, readonly string[] | undefined]> = [];
	let failNextRefresh = false;
	const filesystem = {
		getServiceForWorkspace: () => ({ watchPath: () => quietStream }),
		refreshWatcherIgnores: async (id: string, listing?: readonly string[]) => {
			watcherRefreshes.push([id, listing && [...listing].sort()]);
			if (failNextRefresh) {
				failNextRefresh = false;
				throw new Error("refresh failed");
			}
			return false;
		},
		isWatchAttachBackingOff: () => false,
	};
	const watcher = new GitWatcher(
		db as unknown as ConstructorParameters<typeof GitWatcher>[0],
		filesystem as unknown as ConstructorParameters<typeof GitWatcher>[1],
	);
	cleanups.push(async () => {
		watcher.close();
		await rm(repo, { recursive: true, force: true });
	});
	const internals = watcher as unknown as Internals;
	const state = () => internals.getOrCreateIgnoredDirsState(workspaceId);
	const refreshAndSettle = async () => {
		const before = state().lastRefreshAt;
		internals.refreshIgnoredDirs(workspaceId, repo, true);
		await waitFor(() => state().lastRefreshAt > before && !state().refreshing);
	};

	watcher.watchWorkspace(workspaceId);
	await waitFor(() => state().lastRefreshAt > 0 && !state().refreshing);
	expect(watcherRefreshes).toEqual([]);

	await mkdir(join(repo, "node_modules", "pkg"), { recursive: true });
	await writeFile(join(repo, "node_modules", "pkg", "index.js"), "");
	await refreshAndSettle();
	expect([...state().dirs]).toEqual(["node_modules"]);
	expect(watcherRefreshes).toEqual([[workspaceId, ["node_modules"]]]);

	await refreshAndSettle();
	expect(watcherRefreshes.length).toBe(1);

	await mkdir(join(repo, "dist"));
	await writeFile(join(repo, "dist", "main.js"), "");
	failNextRefresh = true;
	await refreshAndSettle();
	expect(watcherRefreshes.length).toBe(2);
	await refreshAndSettle();
	expect(watcherRefreshes.at(-1)).toEqual([
		workspaceId,
		["dist", "node_modules"],
	]);
	await refreshAndSettle();
	expect(watcherRefreshes.length).toBe(3);
});
