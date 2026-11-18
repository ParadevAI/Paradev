import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../db/schema.ts";
import { applyLegacyHomeMove } from "./legacy-home-paths";

const MIGRATIONS = resolve(import.meta.dir, "../../../drizzle");

let appHome: string;

beforeEach(() => {
	appHome = mkdtempSync(join(tmpdir(), "host-legacy-home-"));
});

afterEach(() => {
	rmSync(appHome, { recursive: true, force: true });
});

describe("applyLegacyHomeMove", () => {
	it("rewrites host.db paths under the moved home", async () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		runMigrations(db, MIGRATIONS);
		db.insert(schema.projects)
			.values({ id: "p1", repoPath: "/u/.superset/projects/app" })
			.run();
		db.insert(schema.workspaces)
			.values({
				id: "w1",
				projectId: "p1",
				worktreePath: "/u/.superset/worktrees/app/main",
				branch: "main",
			})
			.run();
		writeFileSync(
			join(appHome, "legacy-home-move.json"),
			JSON.stringify({ from: "/u/.superset", to: "/u/.paradev" }),
		);

		await applyLegacyHomeMove(db, appHome);

		expect(db.select().from(schema.projects).get()?.repoPath).toBe(
			"/u/.paradev/projects/app",
		);
		expect(db.select().from(schema.workspaces).get()?.worktreePath).toBe(
			"/u/.paradev/worktrees/app/main",
		);
	});

	it("repairs git records left on the legacy home after the rows moved", async () => {
		const root = realpathSync(appHome);
		const legacy = join(root, "legacy");
		const home = join(root, "home");
		const repo = join(root, "repo");
		const git = (...args: string[]) =>
			execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
		mkdirSync(repo);
		git("init", "-q");
		git(
			"-c",
			"user.email=t@t",
			"-c",
			"user.name=t",
			"commit",
			"-q",
			"--allow-empty",
			"-m",
			"x",
		);
		git("worktree", "add", "-q", join(legacy, "worktrees", "wt"));
		mkdirSync(home);
		renameSync(join(legacy, "worktrees"), join(home, "worktrees"));
		const worktreePath = join(home, "worktrees", "wt");

		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		runMigrations(db, MIGRATIONS);
		db.insert(schema.projects).values({ id: "p1", repoPath: repo }).run();
		db.insert(schema.workspaces)
			.values({ id: "w1", projectId: "p1", worktreePath, branch: "wt" })
			.run();
		writeFileSync(
			join(home, "legacy-home-move.json"),
			JSON.stringify({ from: legacy, to: home }),
		);

		await applyLegacyHomeMove(db, home);

		expect(git("worktree", "list", "--porcelain")).toContain(
			`worktree ${worktreePath}`,
		);
	});
});
