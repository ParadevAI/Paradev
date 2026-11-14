import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FsWatcherManager } from "@superset/workspace-fs/host";
import { findNestedRepoRoots } from "@superset/workspace-fs/watch-scan";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { seedProject, seedWorkspace } from "../../../test/helpers/seed";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import {
	scanWorkspaceGitIgnoredDirectories,
	scanWorkspaceNestedRepositories,
} from "./watcher-scans";

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function makeRepo(path: string) {
	mkdirSync(join(path, ".git"), { recursive: true });
}

function setUp(extraRepositories: { repoPath: string; repoName: string }[]) {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, {
		migrationsFolder: resolve(import.meta.dir, "../../../drizzle"),
	});
	const root = realpathSync(mkdtempSync(join(tmpdir(), "watcher-scans-")));
	cleanups.push(() => rmSync(root, { recursive: true, force: true }));
	const project = seedProject(
		{ db },
		{
			repoPath: "/src/web",
			repoName: "web",
			repositories: extraRepositories,
		},
	);
	seedWorkspace(
		{ db },
		{ projectId: project.id, worktreePath: root, branch: "feat" },
	);
	return { db, root };
}

const scanOptions = { pruneDirNames: new Set(["node_modules"]) };
const scan = findNestedRepoRoots;

describe("scanWorkspaceNestedRepositories", () => {
	test("a multi-repo root keeps its checkouts and finds repositories nested in them", async () => {
		const { db, root } = setUp([{ repoPath: "/src/api", repoName: "api" }]);
		makeRepo(join(root, "web"));
		makeRepo(join(root, "api"));
		makeRepo(join(root, "web", "packages", "lib"));
		makeRepo(join(root, "stray"));

		const result = await scanWorkspaceNestedRepositories(
			db,
			root,
			scanOptions,
			scan,
		);

		expect(result.roots.sort()).toEqual(
			[join(root, "stray"), join(root, "web", "packages", "lib")].sort(),
		);
	});

	test("a single-repo root is scanned as before", async () => {
		const { db, root } = setUp([]);
		makeRepo(root);
		makeRepo(join(root, "web"));

		expect(
			await scanWorkspaceNestedRepositories(db, root, scanOptions, scan),
		).toEqual(await findNestedRepoRoots(root, scanOptions));
	});
});

test("scanWorkspaceGitIgnoredDirectories asks each checkout and prefixes its folder", async () => {
	const { db, root } = setUp([{ repoPath: "/src/api", repoName: "api" }]);
	const asked: string[] = [];

	const dirs = await scanWorkspaceGitIgnoredDirectories(
		db,
		root,
		undefined,
		async (path) => {
			asked.push(path);
			return ["dist"];
		},
	);

	expect(asked.sort()).toEqual([join(root, "api"), join(root, "web")]);
	expect(dirs.sort()).toEqual(["api/dist", "web/dist"]);
});

test("a multi-repo root's watcher reports files inside its checkouts", async () => {
	const { db, root } = setUp([{ repoPath: "/src/api", repoName: "api" }]);
	makeRepo(join(root, "web"));
	makeRepo(join(root, "api"));
	const nested = join(root, "web", "packages", "lib");
	makeRepo(nested);
	const manager = new FsWatcherManager({
		debounceMs: 20,
		useDefaultIgnores: false,
		findNestedRepoRoots: (rootPath, options) =>
			scanWorkspaceNestedRepositories(db, rootPath, options, scan),
	});
	cleanups.push(() => manager.close());
	const seen: string[] = [];
	await manager.subscribe({ absolutePath: root }, (batch) => {
		for (const event of batch.events) seen.push(event.absolutePath);
	});

	expect(manager.isPathPruned(root, join(nested, "x.ts"))).toBe(true);
	expect(manager.isPathPruned(root, join(root, "web", "new.ts"))).toBe(false);

	const created = join(root, "web", "new.ts");
	await writeFile(join(nested, "x.ts"), "x");
	await writeFile(created, "x");
	const deadline = Date.now() + 4_000;
	while (!seen.includes(created) && Date.now() < deadline) {
		await Bun.sleep(20);
	}
	expect(seen).toContain(created);
	expect(seen).not.toContain(join(nested, "x.ts"));
});
