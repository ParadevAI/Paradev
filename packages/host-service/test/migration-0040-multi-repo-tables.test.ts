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

describe("0040 multi-repo tables", () => {
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
			rows(sqlite, "SELECT id, primary_repository_id, name, deleted_at FROM projects ORDER BY id"),
		).toEqual([
			{ id: "p1", primary_repository_id: "p1", name: "Acme", deleted_at: null },
			{ id: "p2", primary_repository_id: "p2", name: "Scratch", deleted_at: 99 },
		]);
		expect(
			rows(sqlite, "SELECT id, project_id, name, repo_path, owner, repo_name, remote_name, sparse_checkout_paths FROM repositories ORDER BY id"),
		).toEqual([
			{ id: "p1", project_id: "p1", name: "api", repo_path: "/src/acme-api", owner: "acme", repo_name: "api", remote_name: "origin", sparse_checkout_paths: '["apps/web"]' },
			{ id: "p2", project_id: "p2", name: "scratch", repo_path: "/src/scratch", owner: null, repo_name: null, remote_name: null, sparse_checkout_paths: null },
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
		expect(rows(sqlite, "SELECT id, repository_id FROM pull_requests")).toEqual([
			{ id: "pr1", repository_id: "p1" },
		]);
		expect(rows(sqlite, "SELECT id, worktree_path FROM workspaces ORDER BY id")).toEqual([
			{ id: "w1", worktree_path: "/wt/feat" },
			{ id: "w2", worktree_path: "/sessions/s" },
		]);
	});

	test("a prototype database: hidden rows fold into the container's repositories and checkouts", () => {
		const sqlite = databaseAt("0039_multi_repo");
		sqlite.exec(`
			INSERT INTO projects (id, kind, repo_path, name, created_at, updated_at) VALUES ('c', 'container', '', 'Orbit', 1, 1);
			INSERT INTO projects (id, parent_project_id, repo_path, repo_name, name, created_at, updated_at)
			VALUES ('a', 'c', '/src/orbit-api', 'paradev-mr-orbit-api', 'orbit-api', 2, 2),
			       ('b', 'c', '/src/orbit-web', 'paradev-mr-orbit-web', 'orbit-web', 3, 3),
			       ('o', 'gone', '/src/orphan', NULL, 'orphan', 4, 4);
			INSERT INTO workspaces (id, project_id, worktree_path, branch, name, type, created_at)
			VALUES ('W', 'c', '/wt/root', 'feat', 'Feat', 'worktree', 1);
			INSERT INTO workspaces (id, project_id, parent_workspace_id, worktree_path, branch, name, type, created_at)
			VALUES ('Wa', 'a', 'W', '/wt/root/orbit-api', 'feat', '', 'worktree', 1),
			       ('Wb', 'b', 'W', '/wt/root/orbit-web', 'pr-head', '', 'worktree', 1);
			INSERT INTO terminal_sessions (id, origin_workspace_id, created_at) VALUES ('t1', 'Wa', 1);
			INSERT INTO terminal_agent_bindings (terminal_id, workspace_id, agent_id, started_at, last_event_at, last_event_type)
			VALUES ('t1', 'Wb', 'claude', 1, 1, 'start');
			INSERT INTO workspace_tags (workspace_id, tag) VALUES ('Wa', 'x');
		`);

		migrateToLatest(sqlite);

		expect(rows(sqlite, "SELECT id, primary_repository_id FROM projects")).toEqual([
			{ id: "c", primary_repository_id: "a" },
		]);
		expect(
			rows(sqlite, "SELECT id, project_id, name FROM repositories ORDER BY id"),
		).toEqual([
			{ id: "a", project_id: "c", name: "orbit-api" },
			{ id: "b", project_id: "c", name: "orbit-web" },
		]);
		expect(rows(sqlite, "SELECT id FROM workspaces")).toEqual([{ id: "W" }]);
		expect(
			rows(sqlite, "SELECT workspace_id, repository_id, branch FROM workspace_repositories ORDER BY repository_id"),
		).toEqual([
			{ workspace_id: "W", repository_id: "a", branch: "feat" },
			{ workspace_id: "W", repository_id: "b", branch: "pr-head" },
		]);
		expect(rows(sqlite, "SELECT origin_workspace_id FROM terminal_sessions")).toEqual([
			{ origin_workspace_id: "W" },
		]);
		expect(rows(sqlite, "SELECT workspace_id FROM terminal_agent_bindings")).toEqual([
			{ workspace_id: "W" },
		]);
		expect(rows(sqlite, "SELECT * FROM workspace_tags")).toEqual([]);
	});
	test("prototype leftovers: repeated folder names, one-checkout containers, orphans and workspaces on a child project", () => {
		const sqlite = databaseAt("0039_multi_repo");
		sqlite.exec(`
			INSERT INTO projects (id, kind, repo_path, name, created_at, updated_at) VALUES ('c', 'container', '', 'Dup', 1, 1), ('one', 'container', '', 'One', 1, 1), ('empty', 'container', '', 'Empty', 1, 1);
			INSERT INTO projects (id, parent_project_id, repo_path, name, created_at, updated_at)
			VALUES ('w1', 'c', '/x/web/', 'web', 2, 2),
			       ('w2', 'c', '/y/web', 'web', 3, 3),
			       ('w3', 'c', '/z/web-2', 'web-2', 5, 5),
			       ('solo', 'one', '/z/solo', 'solo', 4, 4),
			       ('left', 'gone', '/z/left', 'left', 6, 6);
			INSERT INTO pull_requests (id, project_id, repo_provider, repo_owner, repo_name, pr_number, url, title, state, head_branch, head_sha, created_at, updated_at)
			VALUES ('pr', 'w1', 'github', 'o', 'web', 1, 'u', 't', 'open', 'f', 's', 1, 1);
			INSERT INTO workspaces (id, project_id, worktree_path, branch, name, type, created_at)
			VALUES ('W', 'c', '/wt/dup', 'f', 'W', 'worktree', 1),
			       ('O', 'one', '/wt/one', 'f', 'O', 'worktree', 1),
			       ('direct', 'w2', '/wt/direct', 'd', 'D', 'worktree', 1),
			       ('onLeft', 'left', '/wt/left', 'l', 'L', 'worktree', 1),
			       ('E', 'empty', '/wt/empty', 'e', 'E', 'worktree', 1);
			INSERT INTO workspaces (id, project_id, parent_workspace_id, worktree_path, branch, name, type, created_at, pull_request_id)
			VALUES ('Wc', 'w1', 'W', '/wt/dup/web', 'f', '', 'worktree', 1, 'pr'),
			       ('Oc', 'solo', 'O', '/wt/one/solo', 'f', '', 'worktree', 1, NULL),
			       ('orphan', 'w2', 'gone', '/wt/gone/web', 'f', '', 'worktree', 1, NULL);
			INSERT INTO workspace_pull_requests (workspace_id, pull_request_id, linked_at) VALUES ('Wc', 'pr', 1);
			INSERT INTO terminal_sessions (id, origin_workspace_id, created_at) VALUES ('t1', 'orphan', 1), ('t2', 'onLeft', 1), ('t3', 'E', 1);
			INSERT INTO terminal_agent_bindings (terminal_id, workspace_id, agent_id, started_at, last_event_at, last_event_type)
			VALUES ('t1', 'orphan', 'claude', 1, 1, 'start'), ('t3', 'E', 'claude', 1, 1, 'start');
			INSERT INTO workspace_tags (workspace_id, tag) VALUES ('onLeft', 'x'), ('E', 'y');
			INSERT INTO tag_folder_settings (scope, tag) VALUES ('empty', 'y');
		`);

		migrateToLatest(sqlite);

		expect(
			rows(sqlite, "SELECT id, project_id, name FROM repositories ORDER BY id"),
		).toEqual([
			{ id: "solo", project_id: "one", name: "solo" },
			{ id: "w1", project_id: "c", name: "web" },
			{ id: "w2", project_id: "c", name: "web-w2" },
			{ id: "w3", project_id: "c", name: "web-2" },
		]);
		expect(
			rows(sqlite, "SELECT id, project_id, worktree_path FROM workspaces ORDER BY id"),
		).toEqual([
			{ id: "O", project_id: "one", worktree_path: "/wt/one/solo" },
			{ id: "W", project_id: "c", worktree_path: "/wt/dup/web" },
			{ id: "direct", project_id: "c", worktree_path: "/wt/direct" },
		]);
		expect(
			rows(sqlite, "SELECT workspace_id, repository_id, pull_request_id FROM workspace_repositories ORDER BY workspace_id"),
		).toEqual([
			{ workspace_id: "O", repository_id: "solo", pull_request_id: null },
			{ workspace_id: "W", repository_id: "w1", pull_request_id: "pr" },
			{ workspace_id: "direct", repository_id: "w2", pull_request_id: null },
		]);
		expect(rows(sqlite, "SELECT workspace_id, pull_request_id FROM workspace_pull_requests")).toEqual([
			{ workspace_id: "W", pull_request_id: "pr" },
		]);
		expect(rows(sqlite, "SELECT id, origin_workspace_id FROM terminal_sessions ORDER BY id")).toEqual([
			{ id: "t1", origin_workspace_id: null },
			{ id: "t2", origin_workspace_id: null },
			{ id: "t3", origin_workspace_id: null },
		]);
		expect(rows(sqlite, "SELECT * FROM terminal_agent_bindings")).toEqual([]);
		expect(rows(sqlite, "SELECT * FROM workspace_tags")).toEqual([]);
		expect(rows(sqlite, "SELECT * FROM tag_folder_settings")).toEqual([]);
	});
});
