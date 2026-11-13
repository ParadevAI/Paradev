import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedProject, seedWorkspace } from "../../test/helpers/seed";
import { createTestDb } from "../trpc/router/pull-requests/shared/test-db";
import { type GitChangedEvent, GitWatcher } from "./git-watcher";

interface Internals {
	watched: Map<string, { worktreePath: string }>;
	flushBatch(key: string): void;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

async function waitFor(check: () => boolean) {
	const deadline = Date.now() + 3_000;
	while (!check()) {
		if (Date.now() > deadline) throw new Error("watchers did not attach");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

test("a two-checkout workspace attaches a watch per checkout, each event naming its repository", async () => {
	const root = mkdtempSync(join(tmpdir(), "git-watch-checkouts-"));
	for (const name of ["api", "web"]) {
		mkdirSync(join(root, name));
		execFileSync("git", ["init", "-q", join(root, name)]);
	}
	const db = createTestDb();
	const project = seedProject(
		{ db },
		{
			repoPath: "/src/api",
			repoName: "api",
			repositories: [{ repoPath: "/src/web", repoName: "web" }],
		},
	);
	seedWorkspace(
		{ db },
		{ id: "ws", projectId: project.id, worktreePath: root, branch: "b" },
	);
	const watchedPaths: string[] = [];
	const filesystem = {
		getServiceForWorkspace: () => ({
			watchPath: ({ absolutePath }: { absolutePath: string }) => {
				watchedPaths.push(absolutePath);
				return {
					[Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
				};
			},
		}),
		refreshWatcherIgnores: async () => false,
		isWatchAttachBackingOff: () => false,
	};
	const states: Array<[string | null, boolean]> = [];
	const watcher = new GitWatcher(
		db,
		filesystem as unknown as ConstructorParameters<typeof GitWatcher>[1],
		(_workspaceId, repositoryId, watched) =>
			states.push([repositoryId, watched]),
	);
	cleanups.push(() => {
		watcher.close();
		rmSync(root, { recursive: true, force: true });
	});
	const events: GitChangedEvent[] = [];
	watcher.onChanged((event) => events.push(event));
	const internals = watcher as unknown as Internals;

	watcher.watchWorkspace("ws");
	await waitFor(() => internals.watched.size === 2);
	for (const key of internals.watched.keys()) internals.flushBatch(key);

	const repositoryIds = [...project.repositoryIds].sort();
	expect(watchedPaths.sort()).toEqual([join(root, "api"), join(root, "web")]);
	expect(states.map(([id, watched]) => `${id}:${watched}`).sort()).toEqual(
		repositoryIds.map((id) => `${id}:true`),
	);
	expect(
		events.map((event) => `${event.workspaceId}:${event.repositoryId}`).sort(),
	).toEqual(repositoryIds.map((id) => `ws:${id}`));
});
