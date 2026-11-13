import { Database as BunDatabase } from "bun:sqlite";
import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../src/db";
import * as schema from "../src/db/schema";
import { workspaces } from "../src/db/schema";
import type { EventBus } from "../src/events";
import { createLocalWorkspace } from "../src/trpc/router/project/utils/create-local-workspace";
import { seedProject } from "./helpers/seed";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../drizzle");
const REPO_PATH = "/repo";

function makeDb(): HostDb {
	const dir = mkdtempSync(join(tmpdir(), "create-local-"));
	const sqlite = new BunDatabase(join(dir, "host.db"), {
		create: true,
		readwrite: true,
	});
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema }) as unknown as HostDb;
	migrate(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
	seedProject({ db }, { id: "p-1", repoPath: REPO_PATH });
	return db;
}

function makeCtx(db: HostDb, branch = "feat/main") {
	const eventBus = {
		broadcastWorkspaceChanged: mock(() => {}),
	} as unknown as EventBus;
	// Git stub: report a branch so the detached-HEAD guard passes.
	const git = mock(async () => ({
		raw: mock(async () => `${branch}\n`),
		revparse: mock(async () => branch),
	}));
	return { db, git: git as never, eventBus };
}

describe("createLocalWorkspace", () => {
	test("every call mints a new identity on the same checkout", async () => {
		const db = makeDb();
		const ctx = makeCtx(db);
		const a = await createLocalWorkspace(ctx, {
			projectId: "p-1",
			name: "bugfix",
		});
		const b = await createLocalWorkspace(ctx, {
			projectId: "p-1",
			name: "docs",
		});
		expect(a.id).not.toBe(b.id);
		expect(a.type).toBe("local");
		expect(a.worktreePath).toBe(REPO_PATH);
		expect(b.worktreePath).toBe(REPO_PATH);
		expect(a.branch).toBe("feat/main");
		expect(b.branch).toBe(a.branch);
		expect(db.select().from(workspaces).all()).toHaveLength(2);
	});

	test("records the checked-out branch at creation time without touching git", async () => {
		const db = makeDb();
		const first = await createLocalWorkspace(makeCtx(db, "main"), {
			projectId: "p-1",
			name: "a",
		});
		const second = await createLocalWorkspace(makeCtx(db, "release"), {
			projectId: "p-1",
			name: "b",
		});
		expect(first.branch).toBe("main");
		expect(second.branch).toBe("release");
	});

	test("refuses a detached HEAD", async () => {
		const db = makeDb();
		const ctx = {
			db,
			eventBus: { broadcastWorkspaceChanged: mock(() => {}) } as never,
			git: (async () => ({
				raw: async () => {
					throw new Error("not a symbolic ref");
				},
				revparse: async () => "HEAD",
			})) as never,
		};
		await expect(
			createLocalWorkspace(ctx, {
				projectId: "p-1",
				name: "x",
			}),
		).rejects.toThrow(/detached-HEAD/);
	});
});

describe("createLocalWorkspace on several repositories", () => {
	test("is refused: a local workspace is one repository's own checkout", async () => {
		const db = makeDb();
		seedProject(
			{ db },
			{ id: "p-2", repoPath: "/web", repositories: [{ repoPath: "/api" }] },
		);
		await expect(
			createLocalWorkspace(makeCtx(db), { projectId: "p-2", name: "x" }),
		).rejects.toThrow(/local_checkout_single_repo/);
	});

	test("records the checkout of its one repository", async () => {
		const db = makeDb();
		const row = await createLocalWorkspace(makeCtx(db), {
			projectId: "p-1",
			name: "a",
		});
		expect(db.select().from(schema.workspaceRepositories).all()).toMatchObject([
			{ workspaceId: row.id, branch: "feat/main" },
		]);
	});
});
