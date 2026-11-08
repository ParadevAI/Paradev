import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
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
	const first = SqliteStateStore.open(path, "v1", 0);
	scan(first, () => first.set("a", { end: 10, state: { label: "x" } }));
	first.close();

	const second = SqliteStateStore.open(path, "v1", 0);
	assert.deepEqual(second.get("a"), { end: 10, state: { label: "x" } });
	second.close();
});

test("a different version starts empty", () => {
	const path = join(root, "version", "usage-cache.db");
	const first = SqliteStateStore.open(path, "v1", 0);
	scan(first, () => first.set("a", 1));
	first.close();

	const second = SqliteStateStore.open(path, "v2", 0);
	assert.equal(second.get("a"), undefined);
	second.close();
});

test("keys a scan did not use are removed from disk", () => {
	const path = join(root, "evict", "usage-cache.db");
	const first = SqliteStateStore.open(path, "v1", 0);
	scan(first, () => {
		first.set("kept", 1);
		first.set("dropped", 2);
	});
	scan(first, () => first.get("kept"));
	first.close();

	const second = SqliteStateStore.open(path, "v1", 0);
	assert.equal(second.get("kept"), 1);
	assert.equal(second.get("dropped"), undefined);
	second.close();
});

test("an unreadable cache file is replaced", () => {
	const path = join(root, "corrupt", "usage-cache.db");
	SqliteStateStore.open(path, "v1", 0).close();
	writeFileSync(path, "not a database");

	const store = SqliteStateStore.open(path, "v1", 0);
	scan(store, () => store.set("a", 1));
	assert.equal(store.get("a"), 1);
	store.close();
});

test("between saves, a newer state stays in memory only", () => {
	const path = join(root, "throttle", "usage-cache.db");
	const first = SqliteStateStore.open(path, "v1", 60_000);
	scan(first, () => first.set("a", 1));
	scan(first, () => first.set("a", 2));
	assert.equal(first.get("a"), 2);
	first.close();

	const second = SqliteStateStore.open(path, "v1", 0);
	assert.equal(second.get("a"), 1);
	second.close();
});
