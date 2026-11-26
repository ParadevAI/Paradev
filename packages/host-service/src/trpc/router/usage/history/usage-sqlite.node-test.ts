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

const OPENCODE_V2_TABLES = `CREATE TABLE session_v2 (id TEXT PRIMARY KEY, directory TEXT NOT NULL, title TEXT);
	CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, seq INTEGER NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL)`;

const opencodeV2Assistant = (now: number, input: number) =>
	JSON.stringify({
		time: { created: now, completed: now },
		agent: "build",
		model: { id: "big-pickle", providerID: "opencode", variant: "default" },
		content: [],
		finish: "stop",
		cost: 0.5,
		tokens: { input, output: 2, reasoning: 1, cache: { read: 4, write: 0 } },
	});

test("OpenCode 2.x usage is read from session_message and session_v2", () => {
	const path = join(root, "opencode-v2.db");
	const db = new Database(path);
	db.exec(OPENCODE_V2_TABLES);
	db.prepare("INSERT INTO session_v2 VALUES ('s2', '/repo', 'Fix it')").run();
	const now = Date.now();
	const insert = db.prepare(
		"INSERT INTO session_message VALUES (?, 's2', ?, ?, ?, ?, ?)",
	);
	insert.run("u", "user", 1, now, now, JSON.stringify({ text: "hi" }));
	insert.run("a", "assistant", 2, now, now, opencodeV2Assistant(now, 10));
	insert.run("i", "idle", 3, now, now, "{}");
	db.close();

	const out: UsageLogEntry[] = [];
	const labels = new Map<string, string>();
	assert.equal(collectOpencodeDbEntries(path, 0, out, labels), 1);
	assert.equal(out.length, 1);
	assert.deepEqual(
		{
			model: out[0]?.model,
			cwd: out[0]?.cwd,
			sessionId: out[0]?.sessionId,
			uncachedInput: out[0]?.uncachedInput,
			cachedInput: out[0]?.cachedInput,
			output: out[0]?.output,
			reasoningOutput: out[0]?.reasoningOutput,
			costUsd: out[0]?.costUsd,
		},
		{
			model: "big-pickle",
			cwd: "/repo",
			sessionId: "s2",
			uncachedInput: 10,
			cachedInput: 4,
			output: 2,
			reasoningOutput: 1,
			costUsd: 0.5,
		},
	);
	assert.equal(labels.get("s2"), "Fix it");
});

test("a 1.x message OpenCode 2.x copied over is counted once", () => {
	const path = join(root, "opencode-migrated.db");
	const db = new Database(path);
	db.exec(`CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, title TEXT);
		CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
		${OPENCODE_V2_TABLES}`);
	db.prepare("INSERT INTO session VALUES ('s', '/old', 'Old')").run();
	db.prepare("INSERT INTO session_v2 VALUES ('s', '/old', 'Old')").run();
	const now = Date.now();
	const v1 = (input: number) =>
		JSON.stringify({
			role: "assistant",
			modelID: "m1",
			time: { created: now, completed: now },
			tokens: { input, output: 1 },
		});
	const insertV1 = db.prepare("INSERT INTO message VALUES (?, 's', ?, ?, ?)");
	insertV1.run("copied", now, now, v1(100));
	insertV1.run("only-v1", now, now, v1(7));
	db.prepare(
		"INSERT INTO session_message VALUES ('copied', 's', 'assistant', 1, ?, ?, ?)",
	).run(now, now, opencodeV2Assistant(now, 100));
	db.close();

	const out: UsageLogEntry[] = [];
	assert.equal(collectOpencodeDbEntries(path, 0, out), 2);
	assert.deepEqual(
		out.map((entry) => [entry.model, entry.uncachedInput]).sort(),
		[
			["big-pickle", 100],
			["m1", 7],
		],
	);
});
