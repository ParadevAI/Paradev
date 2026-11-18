import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import Database from "better-sqlite3";
import { collectDevinEntries } from "./devin.ts";
import { collectOpencodeDbEntries } from "./opencode-db.ts";
import type { UsageLogEntry } from "./parse.ts";

const root = mkdtempSync(join(tmpdir(), "usage-sqlite-"));
after(() => rmSync(root, { recursive: true, force: true }));

test("a malformed Devin message is skipped, not the whole read", () => {
	const path = join(root, "devin.db");
	const db = new Database(path);
	db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, working_directory TEXT, model TEXT, title TEXT);
		CREATE TABLE message_nodes (row_id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, chat_message TEXT, created_at INTEGER)`);
	db.prepare("INSERT INTO sessions VALUES ('s', '/p', 'm', 'T')").run();
	const message = (id: string) =>
		JSON.stringify({
			message_id: id,
			role: "assistant",
			content: "x".repeat(1000),
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
	assert.equal(collectDevinEntries(0, out, new Map(), path), 1);
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
	insert.run("c", now, now, "{not json");
	db.close();

	const out: UsageLogEntry[] = [];
	assert.equal(collectOpencodeDbEntries(path, 0, out), 2);
	assert.deepEqual(
		out.map((entry) => entry.uncachedInput),
		[3],
	);
});
