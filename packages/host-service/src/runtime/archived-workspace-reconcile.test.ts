import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { seedProject, seedWorkspace } from "../../test/helpers/seed";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import {
	isSameWorkspace,
	selectStranded,
} from "./archived-workspace-reconcile";

describe("selectStranded", () => {
	const rows = [
		{ id: "gone", worktreePath: "/wt/gone" },
		{ id: "stranded", worktreePath: "/wt/stranded" },
		{ id: "reused", worktreePath: "/wt/reused" },
	];

	test("picks only tombstones whose worktree survives and is unowned", () => {
		const live = new Set(["/wt/reused"]);
		const exists = (p: string) => p !== "/wt/gone";
		expect(selectStranded(rows, live, exists).map((r) => r.id)).toEqual([
			"stranded",
		]);
	});

	test("never touches a path a live row owns, even if it exists", () => {
		const live = new Set(["/wt/stranded", "/wt/reused"]);
		expect(selectStranded(rows, live, () => true).map((r) => r.id)).toEqual([
			"gone",
		]);
	});

	test("fully cleaned tombstones are left alone", () => {
		expect(selectStranded(rows, new Set(), () => false)).toEqual([]);
	});
});

describe("isSameWorkspace on a multi-repo workspace", () => {
	function fakeCheckout(path: string, branch: string) {
		mkdirSync(join(path, ".git"), { recursive: true });
		writeFileSync(join(path, ".git", "HEAD"), `ref: refs/heads/${branch}\n`);
	}

	function setUp() {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema }) as unknown as HostDb;
		migrate(db as never, {
			migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
		});
		const root = mkdtempSync(join(tmpdir(), "reconcile-multi-"));
		const project = seedProject(
			{ db },
			{
				repoPath: "/src/web",
				repoName: "web",
				repositories: [{ repoPath: "/src/api", repoName: "api" }],
			},
		);
		const row = seedWorkspace(
			{ db },
			{ projectId: project.id, worktreePath: root, branch: "feat" },
		);
		return {
			db,
			root,
			row: { id: row.id, worktreePath: root, branch: "feat", archivedAt: null },
		};
	}

	test("resumes when every checkout still on disk is on the workspace's branch", () => {
		const { db, root, row } = setUp();
		fakeCheckout(join(root, "web"), "feat");

		expect(isSameWorkspace({ db }, row)).toBe(true);
		rmSync(root, { recursive: true, force: true });
	});

	test("leaves it alone when a checkout is on another branch", () => {
		const { db, root, row } = setUp();
		fakeCheckout(join(root, "web"), "feat");
		fakeCheckout(join(root, "api"), "someone-else");

		expect(isSameWorkspace({ db }, row)).toBe(false);
		rmSync(root, { recursive: true, force: true });
	});
});
