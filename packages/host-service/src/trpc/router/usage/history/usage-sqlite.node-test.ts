import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import Database from "better-sqlite3";
import { collectHermesEntries } from "./hermes.ts";
import type { UsageLogEntry } from "./parse.ts";
import { readAppendOnly } from "./sqlite-tail.ts";
import { MemoryStateStore } from "./usage-store.ts";

const root = mkdtempSync(join(tmpdir(), "usage-sqlite-"));
after(() => rmSync(root, { recursive: true, force: true }));

function entry(timestampMs: number, sessionId: string): UsageLogEntry {
	return {
		agent: "devin",
		model: "m",
		timestampMs,
		cwd: null,
		sessionId,
		uncachedInput: 1,
		cachedInput: 0,
		cacheWrite5m: 0,
		cacheWrite1h: 0,
		output: 1,
		reasoningOutput: 0,
	};
}

test("hermes reuses its scan until state.db changes", () => {
	const home = join(root, "hermes");
	mkdirSync(home, { recursive: true });
	// WAL, as Hermes runs it: each write grows state.db-wal, which changes the
	// signature even when it lands in the same timestamp tick.
	const state = new Database(join(home, "state.db"));
	state.pragma("journal_mode = WAL");
	state.exec(`CREATE TABLE sessions (id TEXT, model TEXT, cwd TEXT, title TEXT,
		started_at REAL, ended_at REAL, last_activity_at REAL, input_tokens INT,
		output_tokens INT, cache_read_tokens INT, cache_write_tokens INT,
		reasoning_tokens INT, estimated_cost_usd REAL, actual_cost_usd REAL)`);
	state
		.prepare(
			"INSERT INTO sessions VALUES ('s', 'm', '/p', 'T', ?, NULL, NULL, 10, 5, 0, 0, 0, NULL, NULL)",
		)
		.run(Date.now() / 1000);
	const store = new MemoryStateStore();
	const scan = () => {
		const out: UsageLogEntry[] = [];
		collectHermesEntries(home, 0, out, new Map(), store);
		return out.reduce((sum, e) => sum + e.uncachedInput, 0);
	};
	assert.equal(scan(), 10);

	const key = `hermes:${join(home, "state.db")}`;
	const saved = store.get(key) as { entries: UsageLogEntry[] };
	store.set(key, { ...saved, entries: [] });
	assert.equal(scan(), 0, "an unchanged database reuses the saved scan");

	state.prepare("UPDATE sessions SET input_tokens = 25").run();
	state.close();
	assert.equal(scan(), 25, "a write to state.db scans again");
});

function appendOnlyDb(name: string, rows: number) {
	const path = join(root, `${name}.db`);
	const db = new Database(path);
	db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INT)");
	for (let i = 0; i < rows; i++) {
		db.prepare("INSERT INTO t (ts) VALUES (?)").run(Date.now());
	}
	return { db, path };
}

test("a read that fails halfway leaves no rows behind to count twice", () => {
	const { db, path } = appendOnlyDb("fail-halfway", 1);
	const store = new MemoryStateStore();
	let failNext = true;
	const read = () =>
		readAppendOnly({
			db,
			dbPath: path,
			table: "t",
			stateKey: "t",
			cutoffMs: 0,
			states: store,
			readRows: (after, upTo, out) => {
				const rows = db
					.prepare("SELECT id, ts FROM t WHERE id > ? AND id <= ?")
					.all(after, upTo) as Array<{ id: number; ts: number }>;
				for (const row of rows) {
					out.push(entry(row.ts, String(row.id)));
					if (failNext && row.id === 2) {
						failNext = false;
						throw new Error("read failed");
					}
				}
			},
		});
	assert.equal(read().length, 1);
	for (let i = 0; i < 2; i++) {
		db.prepare("INSERT INTO t (ts) VALUES (?)").run(Date.now());
	}
	assert.throws(read);
	assert.equal(read().length, 3);
	db.close();
});

test("dedupe keys older than the window are dropped", () => {
	const { db, path } = appendOnlyDb("prune", 2);
	const store = new MemoryStateStore();
	const read = (cutoffMs: number) =>
		readAppendOnly({
			db,
			dbPath: path,
			table: "t",
			stateKey: "t",
			cutoffMs,
			states: store,
			readRows: (after, upTo, out, seen) => {
				for (const row of db
					.prepare("SELECT id, ts FROM t WHERE id > ? AND id <= ?")
					.all(after, upTo) as Array<{ id: number; ts: number }>) {
					seen.add(String(row.id));
					out.push(entry(row.ts, String(row.id)));
				}
			},
		});
	read(0);
	const seenKeys = () =>
		Object.keys((store.get("t") as { seen: Record<string, number> }).seen);
	assert.equal(seenKeys().length, 2);
	read(Date.now() + 60_000);
	assert.equal(seenKeys().length, 0);
	db.close();
});
