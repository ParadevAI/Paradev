import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import Database from "better-sqlite3";
import { SqliteStateStore } from "./usage-store.ts";

const root = mkdtempSync(join(tmpdir(), "usage-store-"));
after(() => rmSync(root, { recursive: true, force: true }));

function scan(store: SqliteStateStore, work: () => void): void {
	store.beginScan();
	work();
	store.endScan();
}

test("state written in one session is read back after reopening", () => {
	const path = join(root, "reopen", "usage-cache.db");
	const first = SqliteStateStore.open(path, "v1", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	});
	scan(first, () => first.set("a", { end: 10, state: { label: "x" } }));
	first.close();

	const second = SqliteStateStore.open(path, "v1", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	});
	assert.deepEqual(second.get("a"), { end: 10, state: { label: "x" } });
	second.close();
});

test("a different version starts empty", () => {
	const path = join(root, "version", "usage-cache.db");
	const first = SqliteStateStore.open(path, "v1", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	});
	scan(first, () => first.set("a", 1));
	first.close();

	const second = SqliteStateStore.open(path, "v2", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	});
	assert.equal(second.get("a"), undefined);
	second.close();
});

test("keys a scan did not use are removed from disk", () => {
	const path = join(root, "evict", "usage-cache.db");
	const first = SqliteStateStore.open(path, "v1", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	});
	scan(first, () => {
		first.set("kept", 1);
		first.set("dropped", 2);
	});
	scan(first, () => first.get("kept"));
	first.close();

	const second = SqliteStateStore.open(path, "v1", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	});
	assert.equal(second.get("kept"), 1);
	assert.equal(second.get("dropped"), undefined);
	second.close();
});

test("an unreadable cache file is replaced", () => {
	const path = join(root, "corrupt", "usage-cache.db");
	SqliteStateStore.open(path, "v1", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	}).close();
	writeFileSync(path, "not a database");

	const store = SqliteStateStore.open(path, "v1", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	});
	scan(store, () => store.set("a", 1));
	assert.equal(store.get("a"), 1);
	store.close();
});

test("between saves, a newer state stays in memory only", () => {
	const path = join(root, "throttle", "usage-cache.db");
	const first = SqliteStateStore.open(path, "v1", {
		saveEveryMs: 60_000,
		busyTimeoutMs: 50,
	});
	scan(first, () => first.set("a", 1));
	scan(first, () => first.set("a", 2));
	assert.equal(first.get("a"), 2);
	first.close();

	const second = SqliteStateStore.open(path, "v1", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	});
	assert.equal(second.get("a"), 1);
	second.close();
});

test("a cache file another process has locked is left in place", () => {
	const path = join(root, "locked", "usage-cache.db");
	const first = SqliteStateStore.open(path, "v1", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	});
	scan(first, () => first.set("a", 1));
	first.close();
	const holder = new Database(path);
	holder.exec("PRAGMA locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE;");

	assert.throws(() =>
		SqliteStateStore.open(path, "v2", { saveEveryMs: 0, busyTimeoutMs: 50 }),
	);
	holder.exec("ROLLBACK");
	holder.close();
	assert.ok(existsSync(path));
	const reopened = SqliteStateStore.open(path, "v1", {
		saveEveryMs: 0,
		busyTimeoutMs: 50,
	});
	assert.equal(reopened.get("a"), 1);
	reopened.close();
});

test("a deleted key stays deleted before and after the next save", () => {
	const path = join(root, "delete", "usage-cache.db");
	const options = { saveEveryMs: 60_000, busyTimeoutMs: 50 };
	const first = SqliteStateStore.open(path, "v1", options);
	scan(first, () => first.set("a", 1));
	scan(first, () => {
		first.delete("a");
		assert.equal(first.get("a"), undefined);
	});
	scan(first, () => assert.equal(first.get("a"), undefined));
	first.close();

	const saving = SqliteStateStore.open(path, "v1", {
		...options,
		saveEveryMs: 0,
	});
	scan(saving, () => {
		saving.get("a");
		saving.delete("a");
		saving.get("a");
	});
	saving.close();
	const reopened = SqliteStateStore.open(path, "v1", options);
	assert.equal(reopened.get("a"), undefined);
	reopened.close();
});
