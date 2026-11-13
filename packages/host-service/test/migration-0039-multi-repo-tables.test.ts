import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../drizzle");
const tempDirs: string[] = [];

function folderThrough(tag: string): string {
	const journal = JSON.parse(
		readFileSync(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
	) as { entries: { tag: string }[] };
	const end = journal.entries.findIndex((entry) => entry.tag === tag);
	expect(end).toBeGreaterThan(-1);
	const entries = journal.entries.slice(0, end + 1);
	const dir = mkdtempSync(join(tmpdir(), "host-migrations-"));
	tempDirs.push(dir);
	mkdirSync(join(dir, "meta"));
	for (const entry of entries) {
		copyFileSync(
			join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
			join(dir, `${entry.tag}.sql`),
		);
	}
	writeFileSync(
		join(dir, "meta/_journal.json"),
		JSON.stringify({ version: "7", dialect: "sqlite", entries }),
	);
	return dir;
}

function databaseAt(tag: string): Database {
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = OFF");
	runMigrations(drizzle(sqlite), folderThrough(tag));
	return sqlite;
}

function migrateToLatest(sqlite: Database) {
	runMigrations(drizzle(sqlite), MIGRATIONS_FOLDER);
	expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
}

function rows<T>(sqlite: Database, sql: string): T[] {
	return sqlite.prepare(sql).all() as T[];
}

describe("0039 multi-repo tables", () => {
	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("a released database: each project becomes its own primary repository, each workspace one checkout", () => {
		const sqlite = databaseAt("0038_mobile_devices");
		sqlite.exec(`
			INSERT INTO projects (id, repo_path, repo_provider, repo_owner, repo_name, repo_url, remote_name, sparse_checkout_paths, name, created_at, updated_at)
			VALUES ('p1', '/src/acme-api', 'github', 'acme', 'api', 'https://github.com/acme/api', 'origin', '["apps/web"]', 'Acme', 10, 20);
			INSERT INTO projects (id, repo_path, name, created_at, updated_at, deleted_at)
			VALUES ('p2', '/src/scratch', 'Scratch', 30, 30, 99);
			INSERT INTO pull_requests (id, project_id, repo_provider, repo_owner, repo_name, pr_number, url, title, state, head_branch, head_sha, created_at, updated_at)
			VALUES ('pr1', 'p1', 'github', 'acme', 'api', 7, 'u', 't', 'open', 'feat', 'abc', 1, 1);
			INSERT INTO workspaces (id, project_id, worktree_path, branch, head_sha, upstream_owner, upstream_repo, upstream_branch, pull_request_id, name, type, created_at)
			VALUES ('w1', 'p1', '/wt/feat', 'feat', 'abc', 'acme', 'api', 'feat', 'pr1', 'Feat', 'worktree', 1);
			INSERT INTO workspaces (id, project_id, worktree_path, branch, name, type, created_at)
			VALUES ('w2', NULL, '/sessions/s', 'main', 'Session', 'session', 1);
			INSERT INTO workspace_pull_requests (workspace_id, pull_request_id, linked_at) VALUES ('w1', 'pr1', 5);
		`);

		migrateToLatest(sqlite);

		expect(
			rows(
				sqlite,
				"SELECT id, primary_repository_id, name, deleted_at FROM projects ORDER BY id",
			),
		).toEqual([
			{ id: "p1", primary_repository_id: "p1", name: "Acme", deleted_at: null },
			{
				id: "p2",
				primary_repository_id: "p2",
				name: "Scratch",
				deleted_at: 99,
			},
		]);
		expect(
			rows(
				sqlite,
				"SELECT id, project_id, name, repo_path, owner, repo_name, remote_name, sparse_checkout_paths FROM repositories ORDER BY id",
			),
		).toEqual([
			{
				id: "p1",
				project_id: "p1",
				name: "api",
				repo_path: "/src/acme-api",
				owner: "acme",
				repo_name: "api",
				remote_name: "origin",
				sparse_checkout_paths: '["apps/web"]',
			},
			{
				id: "p2",
				project_id: "p2",
				name: "scratch",
				repo_path: "/src/scratch",
				owner: null,
				repo_name: null,
				remote_name: null,
				sparse_checkout_paths: null,
			},
		]);
		expect(rows(sqlite, "SELECT * FROM workspace_repositories")).toEqual([
			{
				workspace_id: "w1",
				repository_id: "p1",
				branch: "feat",
				head_sha: "abc",
				upstream_owner: "acme",
				upstream_repo: "api",
				upstream_branch: "feat",
				pull_request_id: "pr1",
				suppressed_pull_request_id: null,
			},
		]);
		expect(rows(sqlite, "SELECT id, repository_id FROM pull_requests")).toEqual(
			[{ id: "pr1", repository_id: "p1" }],
		);
		expect(
			rows(sqlite, "SELECT id, worktree_path FROM workspaces ORDER BY id"),
		).toEqual([
			{ id: "w1", worktree_path: "/wt/feat" },
			{ id: "w2", worktree_path: "/sessions/s" },
		]);
	});

	test("pull requests of a project that no longer exists are dropped, and checkouts stop pointing at them", () => {
		const sqlite = databaseAt("0038_mobile_devices");
		sqlite.exec(`
			INSERT INTO projects (id, repo_path, name, created_at, updated_at)
			VALUES ('p1', '/src/web/', 'Web', 10, 5);
			INSERT INTO pull_requests (id, project_id, repo_provider, repo_owner, repo_name, pr_number, url, title, state, head_branch, head_sha, created_at, updated_at)
			VALUES ('gone', 'deleted', 'github', 'o', 'r', 1, 'u', 't', 'open', 'f', 's', 1, 1);
			INSERT INTO workspaces (id, project_id, worktree_path, branch, pull_request_id, suppressed_pull_request_id, name, type, created_at)
			VALUES ('w1', 'p1', '/wt/f', 'f', 'gone', 'gone', 'F', 'worktree', 1);
			INSERT INTO workspace_pull_requests (workspace_id, pull_request_id, linked_at) VALUES ('w1', 'gone', 5);
			INSERT INTO terminal_sessions (id, origin_workspace_id, created_at) VALUES ('t1', 'w1', 1);
		`);

		migrateToLatest(sqlite);

		expect(
			rows(sqlite, "SELECT id, name, created_at, updated_at FROM repositories"),
		).toEqual([{ id: "p1", name: "web", created_at: 10, updated_at: 10 }]);
		expect(rows(sqlite, "SELECT id FROM pull_requests")).toEqual([]);
		expect(
			rows(
				sqlite,
				"SELECT workspace_id, pull_request_id, suppressed_pull_request_id FROM workspace_repositories",
			),
		).toEqual([
			{
				workspace_id: "w1",
				pull_request_id: null,
				suppressed_pull_request_id: null,
			},
		]);
		expect(rows(sqlite, "SELECT * FROM workspace_pull_requests")).toEqual([]);
		expect(
			rows(sqlite, "SELECT origin_workspace_id FROM terminal_sessions"),
		).toEqual([{ origin_workspace_id: "w1" }]);
	});
});
