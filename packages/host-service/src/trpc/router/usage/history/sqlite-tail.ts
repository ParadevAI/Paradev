import { statSync } from "node:fs";
import type Database from "better-sqlite3";
import {
	MAX_SQL_TEXT_LENGTH,
	rememberLabel,
	type UsageLogEntry,
} from "./parse";
import type { UsageStateStore } from "./usage-store";

/** Scan state per agent database, kept between scans by the usage index.
 * Values must be plain JSON data: the index saves them to disk. */
export type SqliteStates = Pick<UsageStateStore, "get" | "set">;

interface KeySet {
	has(key: string): boolean;
	add(key: string): void;
}

interface AppendOnlyTail {
	ino: number;
	/** Database and WAL file signatures when last read. */
	signature: string;
	fromMs: number;
	lastRowId: number;
	/** Rows with rowid <= lastRowId; a drop means rows were deleted. */
	rowCount: number;
	/** Dedupe key → when it was first read, so a later read skips repeats. */
	seen: Record<string, number>;
	entries: UsageLogEntry[];
}

export interface AppendOnlyRead {
	db: InstanceType<typeof Database>;
	dbPath: string;
	/** Table whose rowid only grows as rows are added. */
	table: string;
	stateKey: string;
	cutoffMs: number;
	states?: SqliteStates;
	/** Appends entries for rows with `afterRowId < rowid <= upToRowId`. */
	readRows: (
		afterRowId: number,
		upToRowId: number,
		out: UsageLogEntry[],
		seen: KeySet,
	) => void;
}

/** Rows per read transaction; the worker yields between batches so its
 * timers keep running during a long first read. */
const BATCH_ROWS = 2000;

/** ino, size and mtime of a file, or "-" when it does not exist. */
export function fileSignature(path: string): string {
	try {
		const { ino, size, mtimeMs } = statSync(path);
		return `${ino}:${size}:${mtimeMs}`;
	} catch {
		return "-";
	}
}

/** Entries from `cutoffMs` on, reading only rows added since the last call.
 * Starts over if the file was replaced, rows were deleted, or the window grew. */
export async function readAppendOnly({
	db,
	dbPath,
	table,
	stateKey,
	cutoffMs,
	states,
	readRows,
}: AppendOnlyRead): Promise<UsageLogEntry[]> {
	const { ino } = statSync(dbPath);
	const signature = `${fileSignature(dbPath)}|${fileSignature(`${dbPath}-wal`)}`;
	const top = (
		db.prepare(`SELECT coalesce(max(rowid), 0) AS top FROM ${table}`).get() as {
			top: number;
		}
	).top;
	let tail = states?.get(stateKey) as AppendOnlyTail | undefined;
	// Unchanged file and no new rowid: skip the full count below.
	if (
		tail?.signature === signature &&
		tail.lastRowId === top &&
		tail.fromMs === cutoffMs
	) {
		return tail.entries;
	}
	const countUpTo = db.prepare(
		`SELECT count(*) AS n FROM ${table} WHERE rowid <= ?`,
	);
	if (
		tail &&
		(tail.ino !== ino ||
			cutoffMs < tail.fromMs ||
			top < tail.lastRowId ||
			(countUpTo.get(tail.lastRowId) as { n: number }).n !== tail.rowCount)
	) {
		tail = undefined;
	}
	tail ??= {
		ino,
		signature,
		fromMs: cutoffMs,
		lastRowId: 0,
		rowCount: 0,
		seen: {},
		entries: [],
	};
	if (top > tail.lastRowId) {
		// Counted before the batches, with the max: a row deleted mid-read
		// then shows up as a count drop on the next scan.
		const rowCount = (countUpTo.get(top) as { n: number }).n;
		const batchEnd = db.prepare(
			`SELECT max(rowid) AS upTo FROM (SELECT rowid FROM ${table}
			 WHERE rowid > ? AND rowid <= ? ORDER BY rowid LIMIT ${BATCH_ROWS})`,
		);
		// Applied only once every batch is read: a read that throws halfway
		// must not leave rows in the state that the retry reads again.
		const seen = tail.seen;
		const added = new Map<string, number>();
		const entries: UsageLogEntry[] = [];
		const now = Date.now();
		const keys: KeySet = {
			has: (key) => added.has(key) || Object.hasOwn(seen, key),
			add: (key) => {
				added.set(key, now);
			},
		};
		for (let after = tail.lastRowId; after < top; ) {
			// Batches end on existing rowids, so gaps cost nothing.
			const upTo = (batchEnd.get(after, top) as { upTo: number | null }).upTo;
			if (upTo === null) break;
			db.transaction(() => readRows(after, upTo, entries, keys))();
			after = upTo;
			await new Promise((resolve) => setImmediate(resolve));
		}
		for (const entry of entries) {
			if (entry.timestampMs >= cutoffMs) tail.entries.push(entry);
		}
		for (const [key, at] of added) seen[key] = at;
		tail.lastRowId = top;
		tail.rowCount = rowCount;
	}
	if (cutoffMs > tail.fromMs) {
		tail.entries = tail.entries.filter(
			(entry) => entry.timestampMs >= cutoffMs,
		);
		for (const key in tail.seen) {
			if ((tail.seen[key] ?? 0) < cutoffMs) delete tail.seen[key];
		}
		tail.fromMs = cutoffMs;
	}
	tail.signature = signature;
	states?.set(stateKey, tail);
	return tail.entries;
}

/** One column of the sessions that have entries, by session id. */
function sessionColumn(
	db: InstanceType<typeof Database>,
	table: "session" | "sessions",
	column: "summary" | "title" | "cwd" | "working_directory",
	sessionIds: readonly string[],
): Map<string, string | null> {
	const values = new Map<string, string | null>();
	if (sessionIds.length === 0) return values;
	const rows = db
		.prepare(
			// Titles are capped; a path is read whole, since a cut one would
			// match no project.
			`SELECT id, ${column === "summary" || column === "title" ? `substr(${column}, 1, ${MAX_SQL_TEXT_LENGTH})` : column} AS value
			 FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`,
		)
		.all(JSON.stringify(sessionIds)) as Array<{
		id: string;
		value: string | null;
	}>;
	for (const { id, value } of rows) values.set(id, value || null);
	return values;
}

function sessionIdsOf(entries: readonly UsageLogEntry[]): string[] {
	return [...new Set(entries.map((entry) => entry.sessionId))];
}

/** Titles change after the first message, so they are read on every scan. */
export function setSessionLabels(
	db: InstanceType<typeof Database>,
	table: "session" | "sessions",
	titleColumn: "summary" | "title",
	entries: readonly UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): void {
	if (!sessionLabels) return;
	const ids = sessionIdsOf(entries).filter((id) => !sessionLabels.has(id));
	for (const [id, title] of sessionColumn(db, table, titleColumn, ids)) {
		rememberLabel(sessionLabels, id, title);
	}
}

/** Appends `entries` with each session's current cwd, which can change after
 * the rows were read. */
export function appendWithSessionCwd(
	db: InstanceType<typeof Database>,
	table: "session" | "sessions",
	cwdColumn: "cwd" | "working_directory",
	entries: readonly UsageLogEntry[],
	out: UsageLogEntry[],
): void {
	const cwdById = sessionColumn(db, table, cwdColumn, sessionIdsOf(entries));
	for (const entry of entries) {
		// A session that still exists decides the cwd, cleared or not.
		const cwd = cwdById.has(entry.sessionId)
			? (cwdById.get(entry.sessionId) ?? null)
			: entry.cwd;
		out.push(cwd === entry.cwd ? entry : { ...entry, cwd });
	}
}
