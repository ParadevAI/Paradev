/**
 * OpenCode's SQLite store (`<data>/opencode/opencode.db`). In 1.x assistant
 * messages are JSON in `message.data`, joined to `session` for the cwd and
 * title. 2.x writes `session_message` rows joined to `session_v2`: assistant
 * replies, and compactions, which carry the compaction request's own cost and
 * tokens (the model under `model.id` in both). 2.x copies 1.x messages over
 * under the same id, so a 1.x row is read only when 2.x has no copy of it.
 * Opened read-only — OpenCode may hold the database concurrently.
 * Kept apart from opencode.ts because better-sqlite3 is a Node-only native
 * binding the Bun unit suite cannot load.
 */
import Database from "better-sqlite3";
import {
	type OpencodeMessageRow,
	opencodeRowsToEntries,
} from "./opencode-rows";
import type { UsageLogEntry } from "./parse";

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
		const tables = new Set(
			(
				db
					.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
					.all() as { name: string }[]
			).map((table) => table.name),
		);
		const v2 = tables.has("session_message") && tables.has("session_v2");
		const selects: string[] = [];
		const params: number[] = [];
		// Only the usage fields leave SQLite, one row at a time.
		if (tables.has("message") && tables.has("session")) {
			selects.push(`SELECT m.session_id,
				        json_object(
				          'role', 'assistant',
				          'modelID', json_extract(m.data, '$.modelID'),
				          'time', m.data -> '$.time',
				          'path', json_object('cwd', json_extract(m.data, '$.path.cwd')),
				          'cost', json_extract(m.data, '$.cost'),
				          'tokens', m.data -> '$.tokens'
				        ) AS data,
				        s.directory, s.title
				 FROM message m
				 LEFT JOIN session s ON s.id = m.session_id
				 WHERE m.time_created >= ?
				   AND CASE WHEN json_valid(m.data)
				         THEN json_extract(m.data, '$.role') = 'assistant'
				       END${v2 ? " AND m.id NOT IN (SELECT id FROM session_message)" : ""}`);
			params.push(cutoffMs);
		}
		if (v2) {
			selects.push(`SELECT m.session_id,
				        json_object(
				          'role', 'assistant',
				          'modelID', json_extract(m.data, '$.model.id'),
				          'time', m.data -> '$.time',
				          'cost', json_extract(m.data, '$.cost'),
				          'tokens', m.data -> '$.tokens'
				        ) AS data,
				        s.directory, s.title
				 FROM session_message m
				 LEFT JOIN session_v2 s ON s.id = m.session_id
				 WHERE m.type IN ('assistant', 'compaction')
				   AND m.time_created >= ?
				   AND json_valid(m.data)`);
			params.push(cutoffMs);
		}
		if (selects.length === 0) return 0;
		const rows = db
			.prepare(selects.join("\n UNION ALL\n"))
			.iterate(...params) as Iterable<OpencodeMessageRow>;
		let read = 0;
		const counted = (function* () {
			for (const row of rows) {
				read++;
				yield row;
			}
		})();
		opencodeRowsToEntries(counted, cutoffMs, out, sessionLabels);
		return read;
	} finally {
		db?.close();
	}
}
