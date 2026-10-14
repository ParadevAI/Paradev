/**
 * OpenCode's SQLite store (`<data>/opencode/opencode.db`): assistant messages
 * are JSON in a message table, joined to the session table for the cwd and
 * title. V1 uses `message` and `session`; V2 moves them to `session_message`
 * and `session_v2`. Opened read-only — OpenCode may hold the database
 * concurrently. Kept apart from opencode.ts because better-sqlite3 is a
 * Node-only native binding the Bun unit suite cannot load.
 */
import Database from "better-sqlite3";
import {
	type OpencodeMessageRow,
	opencodeRowsToEntries,
} from "./opencode-rows";
import type { UsageLogEntry } from "./parse";

const V1_QUERY = `SELECT m.session_id, m.data, s.directory, s.title
	FROM message m
	LEFT JOIN session s ON s.id = m.session_id
	WHERE m.time_created >= ?
	  AND json_extract(m.data, '$.role') = 'assistant'`;

const V2_QUERY = `SELECT m.session_id, m.type, m.data, s.directory, s.title
	FROM session_message m
	LEFT JOIN session_v2 s ON s.id = m.session_id
	WHERE m.time_created >= ?
	  AND m.type = 'assistant'`;

/** Returns the number of message rows read. */
export function collectOpencodeDbEntries(
	dbPath: string,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): number {
	let db: InstanceType<typeof Database> | null = null;
	try {
		db = new Database(dbPath, { readonly: true, fileMustExist: true });
		// V2 migrates the V1 tables into its own, so reading both would count
		// that history twice.
		const isV2 = db
			.prepare(
				"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_message'",
			)
			.get();
		const rows = db
			.prepare(isV2 ? V2_QUERY : V1_QUERY)
			.all(cutoffMs) as OpencodeMessageRow[];
		opencodeRowsToEntries(rows, cutoffMs, out, sessionLabels);
		return rows.length;
	} finally {
		db?.close();
	}
}
