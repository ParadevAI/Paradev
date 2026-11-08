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

/** Entries from `cutoffMs` on, reading only rows added since the last call.
 * Starts over if the file was replaced, rows were deleted, or the window grew. */
export function readAppendOnly({
	db,
	dbPath,
	table,
	stateKey,
	cutoffMs,
	states,
	readRows,
}: AppendOnlyRead): UsageLogEntry[] {
	const { ino } = statSync(dbPath);
	const countUpTo = db.prepare(
		`SELECT count(*) AS n FROM ${table} WHERE rowid <= ?`,
	);
	const maxRowId = db.prepare(
		`SELECT coalesce(max(rowid), 0) AS top FROM ${table}`,
	);
	// One read transaction, so the count, the max and the rows agree.
	return db.transaction(() => {
		const top = (maxRowId.get() as { top: number }).top;
		let tail = states?.get(stateKey) as AppendOnlyTail | undefined;
		if (
			tail &&
			(tail.ino !== ino ||
				cutoffMs < tail.fromMs ||
				top < tail.lastRowId ||
				(countUpTo.get(tail.lastRowId) as { n: number }).n !== tail.rowCount)
		) {
			tail = undefined;
		}
		let changed = !tail;
		tail ??= {
			ino,
			fromMs: cutoffMs,
			lastRowId: 0,
			rowCount: 0,
			seen: {},
			entries: [],
		};
		if (top > tail.lastRowId) {
			// Applied only once the read succeeds: a read that throws halfway
			// must not leave rows in the state that the retry reads again.
			const seen = tail.seen;
			const added = new Map<string, number>();
			const entries: UsageLogEntry[] = [];
			const now = Date.now();
			readRows(tail.lastRowId, top, entries, {
				has: (key) => added.has(key) || Object.hasOwn(seen, key),
				add: (key) => {
					added.set(key, now);
				},
			});
			for (const entry of entries) tail.entries.push(entry);
			for (const [key, at] of added) seen[key] = at;
			tail.lastRowId = top;
			tail.rowCount = (countUpTo.get(top) as { n: number }).n;
			changed = true;
		}
		if (cutoffMs > tail.fromMs) {
			tail.entries = tail.entries.filter(
				(entry) => entry.timestampMs >= cutoffMs,
			);
			for (const key in tail.seen) {
				if ((tail.seen[key] ?? 0) < cutoffMs) delete tail.seen[key];
			}
			tail.fromMs = cutoffMs;
			changed = true;
		}
		if (changed) states?.set(stateKey, tail);
		return tail.entries;
	})();
}

/** Titles change after the first message, so they are read on every scan,
 * and only for the sessions that have entries. */
export function setSessionLabels(
	db: InstanceType<typeof Database>,
	table: "session" | "sessions",
	titleColumn: "summary" | "title",
	entries: readonly UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): void {
	if (!sessionLabels) return;
	const ids = [...new Set(entries.map((entry) => entry.sessionId))].filter(
		(id) => !sessionLabels.has(id),
	);
	if (ids.length === 0) return;
	const rows = db
		.prepare(
			`SELECT id, substr(${titleColumn}, 1, ${MAX_SQL_TEXT_LENGTH}) AS title
			 FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`,
		)
		.all(JSON.stringify(ids)) as Array<{ id: string; title: string | null }>;
	for (const { id, title } of rows) rememberLabel(sessionLabels, id, title);
}
