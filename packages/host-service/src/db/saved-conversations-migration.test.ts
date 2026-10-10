import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
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

test("saved-history migration preserves existing terminals and survives PTY deletion and DB reopen", () => {
	const directory = mkdtempSync(join(tmpdir(), "saved-history-migration-"));
	const folder = join(directory, "migrations");
	const source = resolve(import.meta.dir, "../../drizzle");
	const journal = JSON.parse(
		readFileSync(join(source, "meta/_journal.json"), "utf8"),
	) as { entries: Array<{ tag: string }> };
	const index = journal.entries.findIndex(
		(entry) => entry.tag === "0039_saved_native_conversations",
	);
	expect(index).toBeGreaterThan(0);
	mkdirSync(join(folder, "meta"), { recursive: true });
	for (const entry of journal.entries.slice(0, index + 1))
		copyFileSync(
			join(source, `${entry.tag}.sql`),
			join(folder, `${entry.tag}.sql`),
		);
	const setFixtureJournal = (count: number) =>
		writeFileSync(
			join(folder, "meta/_journal.json"),
			JSON.stringify({ ...journal, entries: journal.entries.slice(0, count) }),
		);
	const dbPath = join(directory, "host.db");
	let sqlite = new Database(dbPath);
	try {
		setFixtureJournal(index);
		runMigrations(drizzle(sqlite), folder);
		sqlite.exec(
			"INSERT INTO terminal_sessions (id, status, created_at) VALUES ('old-terminal', 'active', 1)",
		);
		sqlite.exec(
			"INSERT INTO terminal_agent_bindings (terminal_id, workspace_id, agent_id, agent_session_id, started_at, last_event_at, last_event_type) VALUES ('old-terminal', 'workspace', 'claude', 'native-session', 1, 2, 'Stop')",
		);
		const original = sqlite
			.query("SELECT * FROM terminal_agent_bindings")
			.get();
		setFixtureJournal(index + 1);
		runMigrations(drizzle(sqlite), folder);
		expect(sqlite.query("SELECT * FROM terminal_agent_bindings").get()).toEqual(
			original,
		);
		sqlite.exec(
			"INSERT INTO saved_conversations (id, workspace_id, provider, native_session_id, store_path, transcript_path, cwd, definition_id, account_json, provenance_json, adopted_at, terminal_id) VALUES ('saved', 'workspace', 'claude', 'native-session', '/fixture/store', '/fixture/history.jsonl', '/fixture/workspace', 'claude', '{}', '{}', 1, 'old-terminal')",
		);
		sqlite.exec(
			"PRAGMA foreign_keys=ON; DELETE FROM terminal_sessions WHERE id='old-terminal'",
		);
		expect(
			sqlite.query("SELECT * FROM terminal_agent_bindings").get(),
		).toBeNull();
		expect(
			sqlite.query("SELECT id, terminal_id FROM saved_conversations").get(),
		).toEqual({ id: "saved", terminal_id: "old-terminal" });
		sqlite.close();
		sqlite = new Database(dbPath);
		runMigrations(drizzle(sqlite), folder);
		expect(
			sqlite.query("SELECT id, terminal_id FROM saved_conversations").get(),
		).toEqual({ id: "saved", terminal_id: "old-terminal" });
	} finally {
		sqlite.close();
		rmSync(directory, { recursive: true, force: true });
	}
});
