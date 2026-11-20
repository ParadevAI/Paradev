/**
 * Copilot CLI usage. `~/.copilot/session-store.db` (SQLite) has an
 * `assistant_usage_events` table with per-request token counts joined to a
 * `sessions` table carrying the cwd and a summary. Opened read-only — the
 * CLI may hold the database concurrently.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { type CopilotUsageRow, copilotRowsToEntries } from "./copilot-rows";
import type { UsageLogEntry } from "./parse";
import {
	appendWithSessionCwd,
	readAppendOnly,
	type SqliteStates,
	setSessionLabels,
} from "./sqlite-tail";

export { type CopilotUsageRow, copilotRowsToEntries } from "./copilot-rows";

export function copilotDbPath(): string {
	return join(homedir(), ".copilot", "session-store.db");
}

/** Returns 1 when the database was scanned, 0 when absent/unreadable. */
export async function collectCopilotEntries(
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	dbPath: string = copilotDbPath(),
	states?: SqliteStates,
): Promise<number> {
	let db: InstanceType<typeof Database> | null = null;
	try {
		const conn = new Database(dbPath, { readonly: true, fileMustExist: true });
		db = conn;
		const rows = conn.prepare(
			`SELECT e.session_id, e.model, e.input_tokens, e.output_tokens,
			        e.cache_read_tokens, e.cache_write_tokens, e.reasoning_tokens,
			        e.created_at, s.cwd, NULL AS summary
			 FROM assistant_usage_events e
			 LEFT JOIN sessions s ON s.id = e.session_id
			 WHERE e.rowid > ? AND e.rowid <= ?
			   AND e.created_at >= datetime(? / 1000, 'unixepoch')`,
		);
		const entries = await readAppendOnly({
			db: conn,
			dbPath,
			table: "assistant_usage_events",
			stateKey: `copilot:${dbPath}`,
			cutoffMs,
			states,
			readRows: (afterRowId, upToRowId, into) =>
				copilotRowsToEntries(
					rows.iterate(
						afterRowId,
						upToRowId,
						cutoffMs,
					) as Iterable<CopilotUsageRow>,
					cutoffMs,
					into,
				),
		});
		appendWithSessionCwd(conn, "sessions", "cwd", entries, out);
		setSessionLabels(conn, "sessions", "summary", entries, sessionLabels);
		return 1;
	} catch {
		return 0;
	} finally {
		db?.close();
	}
}
