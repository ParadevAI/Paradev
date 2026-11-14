import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrateCheckingForeignKeys } from "./foreign-key-guard.ts";
import * as schema from "./schema.ts";

export type HostDb = ReturnType<typeof createDb>;

export function createDb(dbPath: string, migrationsFolder: string) {
	mkdirSync(dirname(dbPath), { recursive: true });

	const sqlite = new Database(dbPath);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("busy_timeout = 5000");

	const db = drizzle(sqlite, { schema });

	console.error(
		`[host-service:db] Initialized at ${dbPath}, migrations from ${migrationsFolder}`,
	);

	// Migrations run with foreign keys OFF. Drizzle's generated table
	// rebuilds emit `PRAGMA foreign_keys=OFF`, but the runner wraps the whole
	// batch in one transaction where that pragma is a silent no-op — so
	// with FKs on, a rebuild's `DROP TABLE` fires ON DELETE actions into
	// child tables (e.g. nulling terminal_sessions.origin_workspace_id).
	// Disabling at the connection level (outside any transaction) makes the
	// generated SQL behave as written; foreign_key_check then catches any
	// violation a migration actually introduced.
	sqlite.pragma("foreign_keys = OFF");
	// Not drizzle's own migrator: it gates on the highest `created_at` already
	// recorded rather than the set of them, so a migration whose journal `when`
	// sorts below that watermark is skipped silently and stays skipped for the
	// life of the database. That is how machines ended up serving a host.db
	// with no workspace_tags/workspace_tag_settings table (HOST-SERVICE-53/54)
	// and, earlier, no cloud_synced_at/archived_at column.
	// Let a failed migration throw — never serve a half-migrated DB.
	migrateCheckingForeignKeys({
		db,
		readPragma: (pragma) => sqlite.pragma(pragma) as unknown[],
		migrationsFolder,
		dbPath,
	});
	sqlite.pragma("foreign_keys = ON");

	return db;
}
