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
import { migrateCheckingForeignKeys } from "../src/db/foreign-key-guard";

/**
 * 0039 rebuilds `workspaces` with fewer foreign keys, so a legacy orphan
 * `workspaces.project_id` moves from fk id 2 to 0. createDb must still see it
 * as the same pre-existing violation and start. createDb runs on
 * better-sqlite3, which Bun cannot load, so this drives its migrate path on
 * bun:sqlite.
 */

type JournalEntry = { idx: number; when: number; tag: string };

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../drizzle");
const tempDirs: string[] = [];

function readJournal(): JournalEntry[] {
	return (
		JSON.parse(
			readFileSync(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
		) as { entries: JournalEntry[] }
	).entries;
}

function folderWith(entries: JournalEntry[], extraSql?: string): string {
	const dir = mkdtempSync(join(tmpdir(), "host-migrations-"));
	tempDirs.push(dir);
	mkdirSync(join(dir, "meta"));
	for (const entry of entries) {
		copyFileSync(
			join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
			join(dir, `${entry.tag}.sql`),
		);
	}
	const all = [...entries];
	if (extraSql) {
		const last = entries[entries.length - 1] as JournalEntry;
		const extra = {
			idx: last.idx + 1,
			when: last.when + 1,
			tag: "9999_orphan",
		};
		writeFileSync(join(dir, `${extra.tag}.sql`), extraSql);
		all.push(extra);
	}
	writeFileSync(
		join(dir, "meta/_journal.json"),
		JSON.stringify({
			version: "7",
			dialect: "sqlite",
			entries: all.map((entry) => ({
				...entry,
				version: "6",
				breakpoints: true,
			})),
		}),
	);
	return dir;
}

function databaseAt0038WithOrphanWorkspace(): Database {
	const entries = readJournal();
	const end = entries.findIndex((entry) => entry.tag === "0038_mobile_devices");
	expect(end).toBeGreaterThan(-1);
	const sqlite = new Database(":memory:");
	sqlite.exec("PRAGMA foreign_keys = OFF");
	runMigrations(drizzle(sqlite), folderWith(entries.slice(0, end + 1)));
	sqlite.exec(
		"INSERT INTO workspaces (id, project_id, worktree_path, branch, name, type, created_at) VALUES ('w-orphan', 'p-deleted-long-ago', '/wt/o', 'main', 'O', 'worktree', 1)",
	);
	return sqlite;
}

function migrate(sqlite: Database, migrationsFolder: string) {
	migrateCheckingForeignKeys({
		db: drizzle(sqlite),
		readPragma: (pragma) => sqlite.prepare(`PRAGMA ${pragma}`).all(),
		migrationsFolder,
		dbPath: ":memory:",
	});
}

describe("foreign key guard across 0039", () => {
	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("a legacy orphan workspace survives the workspaces rebuild without failing start", () => {
		const sqlite = databaseAt0038WithOrphanWorkspace();

		expect(() => migrate(sqlite, MIGRATIONS_FOLDER)).not.toThrow();
		expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([
			{ table: "workspaces", rowid: 1, parent: "projects", fkid: 0 },
		]);
	});

	test("a violation a migration adds still fails start", () => {
		const sqlite = databaseAt0038WithOrphanWorkspace();
		const folder = folderWith(
			readJournal(),
			"INSERT INTO workspaces (id, project_id, worktree_path, branch, name, type, created_at) VALUES ('w-new', 'p-missing', '/wt/n', 'main', 'N', 'worktree', 1);",
		);

		expect(() => migrate(sqlite, folder)).toThrow(
			/introduced foreign key violation/,
		);
	});
});
