import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import Database from "better-sqlite3";
import { collectDevinEntries } from "./devin.ts";
import { collectOpencodeDbEntries } from "./opencode-db.ts";
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

test("an OpenCode message with a malformed field is skipped, not the whole read", () => {
	const path = join(root, "opencode.db");
	const db = new Database(path);
	db.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, title TEXT);
		CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT)`);
	db.prepare("INSERT INTO session VALUES ('s', '/p', 'T')").run();
	const now = Date.now();
	const data = (tokens: unknown) =>
		JSON.stringify({
			role: "assistant",
			modelID: "m",
			time: { created: now, completed: now },
			tokens,
		});
	const insert = db.prepare("INSERT INTO message VALUES (?, 's', ?, ?, ?)");
	insert.run("a", now, now, data({ input: 3, output: 1 }));
	insert.run("b", now, now, data("invalid"));
	db.close();

	const out: UsageLogEntry[] = [];
	collectOpencodeDbEntries(path, 0, out);
	assert.deepEqual(
		out.map((e) => e.uncachedInput),
		[3],
	);
});

test("a table with a large rowid gap is read in a few batches", async () => {
	const { db, path } = appendOnlyDb("sparse", 0);
	db.prepare("INSERT INTO t (id, ts) VALUES (1, ?)").run(Date.now());
	db.prepare("INSERT INTO t (id, ts) VALUES (50000000, ?)").run(Date.now());
	let batches = 0;
	const entries = await readAppendOnly({
		db,
		dbPath: path,
		table: "t",
		stateKey: "t",
		cutoffMs: 0,
		readRows: (after, upTo, out) => {
			batches++;
			for (const row of db
				.prepare("SELECT id, ts FROM t WHERE id > ? AND id <= ?")
				.all(after, upTo) as Array<{ id: number; ts: number }>) {
				out.push(entry(row.ts, String(row.id)));
			}
		},
	});
	assert.equal(entries.length, 2);
	assert.equal(batches, 1);
	db.close();
});

test("a session cwd cleared after its rows were read is applied on the next read", async () => {
	const path = join(root, "devin-cwd.db");
	const db = new Database(path);
	db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, working_directory TEXT, model TEXT, title TEXT);
		CREATE TABLE message_nodes (row_id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, chat_message TEXT, created_at INTEGER)`);
	db.prepare("INSERT INTO sessions VALUES ('s', '/p', 'm', 'T')").run();
	db.prepare(
		"INSERT INTO message_nodes (session_id, chat_message, created_at) VALUES ('s', ?, ?)",
	).run(
		JSON.stringify({
			message_id: "a",
			role: "assistant",
			metadata: { request_id: "a", metrics: { input_tokens: 1 } },
		}),
		Math.floor(Date.now() / 1000),
	);
	const store = new MemoryStateStore();
	const read = async () => {
		const out: UsageLogEntry[] = [];
		await collectDevinEntries(0, out, new Map(), path, store);
		return out.map((e) => e.cwd);
	};
	assert.deepEqual(await read(), ["/p"]);
	db.prepare("UPDATE sessions SET working_directory = NULL").run();
	assert.deepEqual(await read(), [null]);
	db.close();
});
