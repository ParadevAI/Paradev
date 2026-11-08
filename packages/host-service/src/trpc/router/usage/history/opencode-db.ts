/**
 * OpenCode's SQLite store (`<data>/opencode/opencode.db`, v1.x): assistant
 * messages are JSON in `message.data`, joined to `session` for the cwd and
 * title. Opened read-only — OpenCode may hold the database concurrently.
 * Kept apart from opencode.ts because better-sqlite3 is a Node-only native
 * binding the Bun unit suite cannot load.
 */
import { statSync } from "node:fs";
import Database from "better-sqlite3";
import {
	type OpencodeMessageRow,
	opencodeRowsToEntries,
} from "./opencode-rows";
import type { UsageLogEntry } from "./parse";
import { type SqliteStates, setSessionLabels } from "./sqlite-tail";

/** Rows updated this close below the watermark are read again, in case a
 * clock step put a reply's last update behind it. */
const REREAD_MS = 10 * 60 * 1000;

interface OpencodeTail {
	ino: number;
	fromMs: number;
	/** Highest `time_updated` read; rows at or past it are read again. */
	watermark: number;
	/** `time_created` of every message row in the window, assistant or not,
	 * so a deleted session shows up as a count mismatch. */
	createdById: Record<string, number>;
	entryById: Record<string, UsageLogEntry>;
}

interface OpencodeTailRow extends OpencodeMessageRow {
	id: string;
	time_created: number;
	time_updated: number;
}

/** Returns the number of message rows read. Rows change as a reply streams
 * in, so they are re-read by `time_updated`. */
export function collectOpencodeDbEntries(
	dbPath: string,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	states?: SqliteStates,
): number {
	let db: InstanceType<typeof Database> | null = null;
	try {
		const { ino } = statSync(dbPath);
		const conn = new Database(dbPath, { readonly: true, fileMustExist: true });
		db = conn;
		const changedRows = conn.prepare(
			`SELECT m.id, m.session_id, m.time_created, m.time_updated,
			        CASE WHEN json_valid(m.data) THEN
			          CASE WHEN json_extract(m.data, '$.role') = 'assistant' THEN
			            json_object(
			              'role', 'assistant',
			              'modelID', json_extract(m.data, '$.modelID'),
			              'time', m.data -> '$.time',
			              'path', json_object('cwd', json_extract(m.data, '$.path.cwd')),
			              'cost', json_extract(m.data, '$.cost'),
			              'tokens', m.data -> '$.tokens'
			            )
			          END
			        END AS data,
			        s.directory, NULL AS title
			 FROM message m
			 LEFT JOIN session s ON s.id = m.session_id
			 WHERE m.time_created >= ? AND m.time_updated >= ?`,
		);
		const countInWindow = conn.prepare(
			"SELECT count(*) AS n FROM message WHERE time_created >= ?",
		);
		const stateKey = `opencode:${dbPath}`;
		const freshTail = (): OpencodeTail => ({
			ino,
			fromMs: cutoffMs,
			watermark: 0,
			createdById: {},
			entryById: {},
		});
		/** Returns the rows read and whether any was new or changed. */
		const readChanges = (tail: OpencodeTail) => {
			let read = 0;
			let changed = false;
			const since = tail.watermark;
			let watermark = since;
			for (const row of changedRows.iterate(
				tail.fromMs,
				Math.max(0, since - REREAD_MS),
			) as Iterable<OpencodeTailRow>) {
				read++;
				tail.createdById[row.id] = row.time_created;
				if (row.time_updated > since) changed = true;
				if (row.time_updated > watermark) watermark = row.time_updated;
				const entries: UsageLogEntry[] = [];
				opencodeRowsToEntries([row], tail.fromMs, entries);
				const entry = entries[0];
				if (entry) tail.entryById[row.id] = entry;
				else delete tail.entryById[row.id];
			}
			tail.watermark = watermark;
			return { read, changed };
		};
		const { tail, read, changed } = conn.transaction(() => {
			let tail = states?.get(stateKey) as OpencodeTail | undefined;
			if (tail && (tail.ino !== ino || cutoffMs < tail.fromMs)) {
				tail = undefined;
			}
			let changed = !tail;
			tail ??= freshTail();
			if (cutoffMs > tail.fromMs) {
				for (const [id, createdMs] of Object.entries(tail.createdById)) {
					if (createdMs < cutoffMs) {
						delete tail.createdById[id];
						delete tail.entryById[id];
					}
				}
				tail.fromMs = cutoffMs;
				changed = true;
			}
			let scan = readChanges(tail);
			const { n } = countInWindow.get(tail.fromMs) as { n: number };
			if (n !== Object.keys(tail.createdById).length) {
				tail = freshTail();
				scan = readChanges(tail);
				changed = true;
			}
			return { tail, read: scan.read, changed: changed || scan.changed };
		})();
		if (changed) states?.set(stateKey, tail);
		const entries = Object.values(tail.entryById);
		for (const entry of entries) {
			if (entry.timestampMs >= cutoffMs) out.push(entry);
		}
		setSessionLabels(conn, "session", "title", entries, sessionLabels);
		return read;
	} finally {
		db?.close();
	}
}
