import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import Database from "better-sqlite3";
import { collectDevinEntries } from "./devin.ts";
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

function appendOnlyDb(name: string, rows: number) {
	const path = join(root, `${name}.db`);
	const db = new Database(path);
	db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INT)");
	for (let i = 0; i < rows; i++) {
		db.prepare("INSERT INTO t (ts) VALUES (?)").run(Date.now());
	}
	return { db, path };
}

test("a read that fails halfway leaves no rows behind to count twice", async () => {
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
	assert.equal((await read()).length, 1);
	for (let i = 0; i < 2; i++) {
		db.prepare("INSERT INTO t (ts) VALUES (?)").run(Date.now());
	}
	await assert.rejects(read);
	assert.equal((await read()).length, 3);
	db.close();
});

test("dedupe keys older than the window are dropped", async () => {
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
	await read(0);
	const seenKeys = () =>
		Object.keys((store.get("t") as { seen: Record<string, number> }).seen);
	assert.equal(seenKeys().length, 2);
	await read(Date.now() + 60_000);
	assert.equal(seenKeys().length, 0);
	db.close();
});

test("a malformed Devin message is skipped, not the whole read", async () => {
	const path = join(root, "devin.db");
	const db = new Database(path);
	db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, working_directory TEXT, model TEXT, title TEXT);
		CREATE TABLE message_nodes (row_id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, chat_message TEXT, created_at INTEGER)`);
	db.prepare("INSERT INTO sessions VALUES ('s', '/p', 'm', 'T')").run();
	const message = (id: string) =>
		JSON.stringify({
			message_id: id,
			role: "assistant",
			metadata: {
				request_id: id,
				metrics: { input_tokens: 1, output_tokens: 1 },
			},
		});
	const insert = db.prepare(
		"INSERT INTO message_nodes (session_id, chat_message, created_at) VALUES ('s', ?, ?)",
	);
	const nowSeconds = Math.floor(Date.now() / 1000);
	insert.run(message("a"), nowSeconds);
	insert.run('{"role": "assistant", ', nowSeconds);
	insert.run(message("b"), nowSeconds);
	db.close();

	const out: UsageLogEntry[] = [];
	assert.equal(await collectDevinEntries(0, out, new Map(), path), 1);
	assert.equal(out.length, 2);
});
